import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  linkWithCredential,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  addDoc,
  collection,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const authForm = document.querySelector("#auth-form");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const signInButton = document.querySelector("#sign-in");
const signUpButton = document.querySelector("#sign-up");
const signOutButton = document.querySelector("#sign-out");
const accountPanel = document.querySelector("#account-panel");
const accountEmail = document.querySelector("#account-email");
const startButton = document.querySelector("#start");
const stopButton = document.querySelector("#stop");
const statusMessage = document.querySelector("#status");
const latitudeOutput = document.querySelector("#latitude");
const longitudeOutput = document.querySelector("#longitude");
const accuracyOutput = document.querySelector("#accuracy");
const capturedAtOutput = document.querySelector("#captured-at");

const map = L.map("map").setView([0, 0], 2);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

let watchId = null;
let writeQueue = Promise.resolve();
let database;
let auth;
let unsubscribeLocations;
let locationMarker;
let accuracyCircle;
let hasCenteredMap = false;

function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("error", isError);
}

function hasFirebaseConfig() {
  return (
    firebaseConfig.apiKey !== "REEMPLAZA_CON_TU_API_KEY" &&
    firebaseConfig.projectId !== "REEMPLAZA_CON_TU_PROYECTO" &&
    firebaseConfig.appId !== "REEMPLAZA_CON_TU_APP_ID"
  );
}

function formatCoordinate(value) {
  return value.toFixed(6);
}

function showPosition({ latitude, longitude, accuracy }, capturedAt) {
  const coordinates = [latitude, longitude];

  latitudeOutput.textContent = formatCoordinate(latitude);
  longitudeOutput.textContent = formatCoordinate(longitude);
  accuracyOutput.textContent = `${Math.round(accuracy)} m`;
  capturedAtOutput.textContent = capturedAt.toLocaleString();

  if (!locationMarker) {
    locationMarker = L.marker(coordinates).addTo(map);
    accuracyCircle = L.circle(coordinates, { radius: accuracy }).addTo(map);
  } else {
    locationMarker.setLatLng(coordinates);
    accuracyCircle.setLatLng(coordinates).setRadius(accuracy);
  }
  locationMarker.bindPopup("Última ubicación compartida");
  if (!hasCenteredMap) {
    map.setView(coordinates, 16);
    hasCenteredMap = true;
  } else {
    map.panTo(coordinates);
  }
}

function clearSharedLocation() {
  if (locationMarker) {
    map.removeLayer(locationMarker);
    map.removeLayer(accuracyCircle);
    locationMarker = undefined;
    accuracyCircle = undefined;
  }
  latitudeOutput.textContent = "—";
  longitudeOutput.textContent = "—";
  accuracyOutput.textContent = "—";
  capturedAtOutput.textContent = "—";
  hasCenteredMap = false;
  map.setView([0, 0], 2);
}

function savePosition(position, userId) {
  const { latitude, longitude, accuracy } = position.coords;
  const capturedAt = new Date(position.timestamp);
  showPosition(position.coords, capturedAt);

  writeQueue = writeQueue
    .then(() =>
      addDoc(collection(database, "users", userId, "locations"), {
        latitude,
        longitude,
        accuracy,
        capturedAt: serverTimestamp(),
      }),
    )
    .then(() => setStatus("Ubicación guardada en Cloud Firestore."))
    .catch((error) => {
      console.error("No se pudo guardar la ubicación en Cloud Firestore.", error);
      setStatus(`No se pudo guardar la ubicación: ${error.message}`, true);
    });
}

function listenToSharedLocation(userId) {
  const locationsQuery = query(
    collection(database, "users", userId, "locations"),
    orderBy("capturedAt", "desc"),
    limit(1),
  );

  unsubscribeLocations = onSnapshot(
    locationsQuery,
    (snapshot) => {
      if (snapshot.empty) {
        setStatus("Cuenta conectada. Aún no hay ubicaciones compartidas.");
        return;
      }

      const latestLocation = snapshot.docs[0].data();
      showPosition(
        latestLocation,
        latestLocation.capturedAt?.toDate() ?? new Date(),
      );
    },
    (error) => {
      console.error("No se pudo sincronizar la ubicación compartida.", error);
      setStatus(`No se pudo sincronizar la ubicación: ${error.message}`, true);
    },
  );
}

function reportPositionError(error) {
  const messages = {
    1: "Permiso de ubicación denegado. Habilítalo en el navegador para continuar.",
    2: "No fue posible determinar la ubicación del dispositivo.",
    3: "La solicitud de ubicación agotó el tiempo de espera.",
  };
  setStatus(messages[error.code] ?? `Error de ubicación: ${error.message}`, true);
}

async function startTracking() {
  if (!navigator.geolocation) {
    setStatus("Este navegador no admite geolocalización.", true);
    return;
  }

  const user = auth.currentUser;
  if (!user) {
    setStatus("Inicia sesión antes de activar el seguimiento.", true);
    return;
  }

  startButton.disabled = true;
  setStatus("Solicitando permiso de ubicación…");
  watchId = navigator.geolocation.watchPosition(
    (position) => savePosition(position, user.uid),
    reportPositionError,
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
  );
  stopButton.disabled = false;
  setStatus("Seguimiento activo. Esperando una lectura del GPS…");
}

function stopTracking() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  startButton.disabled = false;
  stopButton.disabled = true;
  setStatus("Seguimiento detenido.");
}

function setAuthFormDisabled(disabled) {
  emailInput.disabled = disabled;
  passwordInput.disabled = disabled;
  signInButton.disabled = disabled;
  signUpButton.disabled = disabled;
}

function describeAuthError(error) {
  const messages = {
    "auth/email-already-in-use": "Ese correo ya tiene una cuenta. Inicia sesión.",
    "auth/credential-already-in-use": "Ese correo ya tiene una cuenta. Inicia sesión para compartirla.",
    "auth/invalid-credential": "Correo o contraseña incorrectos.",
    "auth/invalid-email": "Escribe un correo electrónico válido.",
    "auth/network-request-failed": "No hay conexión. Revisa internet e inténtalo otra vez.",
    "auth/too-many-requests": "Demasiados intentos. Espera un momento e inténtalo otra vez.",
    "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
    "auth/operation-not-allowed": "Habilita Correo/contraseña en Firebase Authentication.",
  };
  return messages[error.code] ?? error.message;
}

async function authenticate(action) {
  setAuthFormDisabled(true);
  setStatus(action === "sign-in" ? "Iniciando sesión…" : "Creando cuenta…");

  try {
    if (action === "sign-in") {
      await signInWithEmailAndPassword(
        auth,
        emailInput.value.trim(),
        passwordInput.value,
      );
    } else {
      const currentUser = auth.currentUser;
      if (currentUser?.isAnonymous) {
        const credential = EmailAuthProvider.credential(
          emailInput.value.trim(),
          passwordInput.value,
        );
        await linkWithCredential(currentUser, credential);
      } else {
        await createUserWithEmailAndPassword(
          auth,
          emailInput.value.trim(),
          passwordInput.value,
        );
      }
    }
    passwordInput.value = "";
  } catch (error) {
    console.error("No se pudo autenticar la cuenta.", error);
    setStatus(`No se pudo iniciar sesión: ${describeAuthError(error)}`, true);
  } finally {
    setAuthFormDisabled(false);
  }
}

function handleAuthState(user) {
  if (unsubscribeLocations) {
    unsubscribeLocations();
    unsubscribeLocations = undefined;
  }

  if (!user) {
    stopTracking();
    clearSharedLocation();
    accountPanel.hidden = true;
    authForm.hidden = false;
    startButton.disabled = true;
    return;
  }

  if (user.isAnonymous) {
    authForm.hidden = false;
    accountPanel.hidden = true;
    startButton.disabled = false;
    setStatus("Sesión anterior detectada. Crea una cuenta para compartir tus ubicaciones.");
    listenToSharedLocation(user.uid);
    return;
  }

  authForm.hidden = true;
  accountPanel.hidden = false;
  accountEmail.textContent = user.email;
  startButton.disabled = false;
  setStatus("Cuenta conectada. Sincronizando ubicaciones…");
  listenToSharedLocation(user.uid);
}

authForm.addEventListener("submit", (event) => {
  event.preventDefault();
  authenticate("sign-in");
});
signUpButton.addEventListener("click", () => authenticate("sign-up"));
signOutButton.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("No se pudo cerrar la sesión.", error);
    setStatus(`No se pudo cerrar la sesión: ${error.message}`, true);
  }
});
startButton.addEventListener("click", startTracking);
stopButton.addEventListener("click", stopTracking);

if (!hasFirebaseConfig()) {
  startButton.disabled = true;
  setAuthFormDisabled(true);
  setStatus("Completa firebase-config.js con la configuración de tu proyecto.", true);
} else {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  database = getFirestore(app);
  onAuthStateChanged(auth, handleAuthState, (error) => {
    console.error("No se pudo comprobar la sesión.", error);
    setStatus(`No se pudo comprobar la sesión: ${error.message}`, true);
  });
}
