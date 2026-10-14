# Localizador

Página web de seguimiento voluntario que guarda en Cloud Firestore cada nueva
lectura de ubicación que informa el navegador. El seguimiento solo comienza
después de que la persona pulse **Iniciar seguimiento** y autorice la ubicación;
se puede detener con el botón **Detener**.

El mapa muestra la última posición recibida y su radio aproximado de precisión.
Usa Leaflet y los mapas de OpenStreetMap, por lo que necesita conexión a
internet para cargar sus mosaicos.

## Configuración de Firebase

1. Crea un proyecto en Firebase y registra una aplicación web.
2. Copia la configuración de la aplicación en `firebase-config.js`.
3. En **Authentication > Sign-in method**, habilita **Email/Password**.
4. Crea una base de datos de **Cloud Firestore** y publica las reglas de
   `firestore.rules`.
5. Sirve esta carpeta con un servidor web local o publícala en un sitio HTTPS.
   Los navegadores suelen requerir HTTPS para geolocalización fuera de
   `localhost`; abrir `index.html` directamente puede no funcionar.

La primera vez, crea una cuenta con correo y contraseña; en los demás
dispositivos inicia sesión con esa misma cuenta. La aplicación almacena los
registros en `users/{uid}/locations` y sincroniza en tiempo real la última
ubicación entre sesiones de esa cuenta. Las reglas permiten que cada persona
autenticada cree y lea solo sus propios registros, y no permiten modificarlos
ni borrarlos. Publica las reglas de `firestore.rules` en Firebase para habilitar
la lectura y escritura. Si este navegador ya tenía una sesión anónima de la
versión anterior, crear la cuenta desde ahí la vincula y conserva sus registros.
Las ubicaciones de sesiones anónimas en otros dispositivos no se trasladan
automáticamente.

## Frecuencia

Los navegadores no pueden obtener lecturas GPS cada 1 milisegundo. La página
usa `watchPosition` y guarda cada lectura nueva que proporciona el sistema
operativo; la frecuencia real depende del dispositivo, el navegador y las
condiciones de señal.
