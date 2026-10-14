import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  addDoc,
  collection,
  getFirestore,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

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

  startButton.disabled = true;
  setStatus("Conectando con Cloud Firestore…");

  try {
    const user = auth.currentUser ?? (await signInAnonymously(auth)).user;
    setStatus("Solicitando permiso de ubicación…");
    watchId = navigator.geolocation.watchPosition(
      (position) => savePosition(position, user.uid),
      reportPositionError,
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
    stopButton.disabled = false;
    setStatus("Seguimiento activo. Esperando una lectura del GPS…");
  } catch (error) {
    console.error("No se pudo iniciar el seguimiento.", error);
    setStatus(`No se pudo iniciar el seguimiento: ${error.message}`, true);
    startButton.disabled = false;
  }
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

startButton.addEventListener("click", startTracking);
stopButton.addEventListener("click", stopTracking);

if (!hasFirebaseConfig()) {
  startButton.disabled = true;
  setStatus("Completa firebase-config.js con la configuración de tu proyecto.", true);
} else {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  database = getFirestore(app);
  setStatus("Listo. Inicia el seguimiento para guardar en Cloud Firestore.");
}
