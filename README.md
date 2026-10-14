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
3. Habilita **Authentication > Sign-in method > Anonymous**.
4. Crea una base de datos de **Cloud Firestore** y publica las reglas de
   `firestore.rules`.
5. Sirve esta carpeta con un servidor web local o publícala en un sitio HTTPS.
   Los navegadores suelen requerir HTTPS para geolocalización fuera de
   `localhost`; abrir `index.html` directamente puede no funcionar.

La aplicación usa autenticación anónima y almacena registros en
`users/{uid}/locations`. Las reglas permiten a cada sesión autenticada crear y
leer solo sus propios registros, y no permiten modificarlos ni borrarlos.

## Frecuencia

Los navegadores no pueden obtener lecturas GPS cada 1 milisegundo. La página
usa `watchPosition` y guarda cada lectura nueva que proporciona el sistema
operativo; la frecuencia real depende del dispositivo, el navegador y las
condiciones de señal.
