# Tydom

Controla tus dispositivos Delta Dore Tydom desde Gladys: persianas, luces,
portones y puertas de garaje, termostatos, además de sus sensores de batería y
de temperatura.

## Funcionamiento

```
Pasarela Tydom  <──>  tydom2mqtt  <──>  Broker MQTT  <──>  Gladys (esta integración)
```

La integración ejecuta [tydom2mqtt](https://github.com/tydom2mqtt/tydom2mqtt)
en un subcontenedor gestionado por Gladys. tydom2mqtt se conecta a tu pasarela
Tydom y publica tus dispositivos en tu broker MQTT. La integración los lee en
el broker y envía tus órdenes a través de él.

Necesitas un broker MQTT accesible desde Gladys, por ejemplo el broker
Mosquitto instalado por la integración MQTT de Gladys. La integración requiere Gladys 5.3.0 o posterior.

## Configuración

1. Abre la pestaña **Configuración** de la integración.
2. **Pasarela Tydom**
   - **Dirección MAC**: impresa debajo de la pasarela, empieza por `001A25`.
   - **Contraseña**: la impresa debajo de la pasarela. Puedes dejarla vacía e
     indicar en su lugar tu **cuenta Delta Dore** (correo + contraseña):
     tydom2mqtt obtiene entonces él mismo la contraseña de la pasarela.
   - **Dirección IP**: la IP local de la pasarela (recomendado, asígnale una
     IP fija en tu router). Deja `mediation.tydom.com` para pasar por la nube
     de Delta Dore.
3. **Broker MQTT**: host, puerto, usuario y contraseña de tu broker. Usa la
   dirección IP local de la máquina que ejecuta el broker — `localhost`
   apuntaría al interior de los contenedores.
4. Guarda. Gladys inicia tydom2mqtt con estos parámetros; tus dispositivos
   aparecen en la pestaña **Descubrimiento** en menos de un minuto, listos
   para ser añadidos.

Cada cambio de configuración reinicia tydom2mqtt con los nuevos valores.

### ¿Ya usas tydom2mqtt?

Si ya ejecutas tydom2mqtt por tu cuenta (docker-compose, complemento de Home
Assistant…) en el mismo broker, desactiva **Ejecutar tydom2mqtt desde
Gladys**: la integración se limita entonces a leer sus topics. Solo se
necesitan los campos MQTT.

## Dispositivos compatibles

| Dispositivo Tydom        | En Gladys                                        |
| ------------------------ | ------------------------------------------------ |
| Persiana                 | Abrir / cerrar / parar + posición (0 = cerrada)  |
| Puerta de garaje         | Abrir / cerrar / parar + posición                |
| Luz                      | Encender/apagar + brillo                         |
| Portón, puerta (impulso) | Interruptor: cada orden envía un impulso TOGGLE  |
| Termostato / caldera     | Temperatura de consigna + temperatura actual     |
| Sensores                 | Batería, temperatura, humedad, potencia, energía |

Aún no compatible: alarma, modos y preajustes de calefacción, inclinación de
las lamas.

## Acciones

- **Resincronizar los dispositivos Tydom** — pide a tydom2mqtt que recargue la
  configuración Tydom y vuelva a publicar todos los dispositivos. Úsala después
  de añadir un dispositivo a tu instalación Tydom.

## Widgets del panel

En **Panel → Editar → Añadir un widget**,
elige uno de los tres widgets Tydom. Solo muestran los dispositivos Tydom
añadidos en Gladys, con el nombre que les diste: un dispositivo solo
descubierto no aparece.

| Widget            | Ajustes                      | Para                                    |
| ----------------- | ---------------------------- | --------------------------------------- |
| Dispositivo Tydom | un dispositivo (obligatorio) | ver y controlar todo de un dispositivo  |
| Persianas Tydom   | persianas (todas si vacío)   | todas las persianas, una a una o juntas |
| Pilas Tydom       | solo pilas bajas (no)        | vigilar las pilas de los sensores       |

### Dispositivo Tydom

Un dispositivo a elegir, sea cual sea:

- **Valores en directo** (hasta 6): posición de una persiana y brillo de una
  luz en indicador, luego consigna, temperatura, humedad, potencia, energía,
  corriente, tensión, movimiento y pila.
- **Gráfico de las últimas 24 h** de la medida más útil: temperatura, si no
  potencia, humedad, posición de la persiana o brillo. Ausente si el
  historial de la funcionalidad está desactivado en Gladys.
- **Mandos**: **Abrir** / **Parar** / **Cerrar** para una persiana,
  **Encender** / **Apagar** para una luz o un portón, **−0,5 °C** /
  **+0,5 °C** para un termostato (la consigna queda dentro del mín/máx del
  dispositivo).

Todo está vinculado a las funcionalidades del dispositivo: los valores y el
gráfico siguen los cambios en tiempo real. Si el dispositivo se elimina de
Gladys, el widget te invita a elegir otro.

### Persianas Tydom

Todas tus persianas de un vistazo:

- cuántas persianas están **abiertas** (posición > 0 %) y **cerradas**;
- las persianas ordenadas por nombre con su estado: **Cerrada**, **Abierta**
  o la posición en % (10 como máximo, las demás contadas como «+N más»);
- el botón **Mover una persiana…**: abre un formulario en el que eliges
  **una** persiana de la lista y luego la orden — **Abrir**, **Parar**,
  **Cerrar** o **Posición** (escribe entonces la posición deseada, de 0 a
  100 %). Un mensaje confirma la orden enviada, por ejemplo «Salón:
  cerrando». Así basta un solo widget para controlar cada persiana por
  separado;
- los botones **Abrir todo** / **Parar todo** / **Cerrar todo** (cerrar pide
  una confirmación). El mensaje indica cuántas persianas recibieron la orden
  y cuántas fallaron.

El ajuste **Persianas** limita el widget a algunas persianas (por estancia,
por planta…): vacío, las toma todas, incluidas las añadidas más tarde. La
lista se actualiza unos segundos después de cada movimiento.

### Pilas Tydom

El nivel de pila de cada dispositivo Tydom con pilas, las más bajas primero:

- cuántas pilas hay **a cambiar** y cuántas están **vigiladas**;
- la lista: en rojo al 15 % o menos (o si el dispositivo indica un fallo de
  pila), en naranja al 30 % o menos, en verde por encima.

El ajuste **Solo pilas bajas** oculta las que están bien (el widget muestra
entonces «Todas las pilas están bien.»).

### Conviene saber

- Los botones propios de los widgets (**Abrir todo**/**Parar todo**/**Cerrar
  todo**, **Mover una persiana…**, **±0,5 °C**) comprueban primero el broker MQTT: si
  está desconectado, un mensaje lo indica en lugar de enviar la orden.
- Las persianas Tydom solo informan de su posición: no existe un estado «en
  movimiento», la posición se actualiza cuando la persiana se detiene.

## Solución de problemas

- **Ningún dispositivo en Descubrimiento**: consulta los registros del
  subcontenedor tydom2mqtt en la página de la integración. Deben aparecer
  `Connected to mqtt broker` y dispositivos `created / updated`. Una dirección
  MAC o una contraseña incorrecta se traduce en un error de autenticación
  frente a la pasarela.
- **«Broker MQTT inaccesible»**: el host debe ser accesible desde los
  contenedores de Gladys (IP local, no `localhost`), y el usuario/contraseña
  aceptados por el broker.
- **Las persianas ya no responden (`ConnectionClosedOK` en los registros de
  tydom2mqtt)**: la pasarela Tydom cerró su conexión y tydom2mqtt no se
  reconectó. La integración lo detecta (sin respuesta tras un comando, o un
  largo silencio) y reinicia tydom2mqtt automáticamente en menos de un minuto.
  Vuelve a enviar el comando cuando los dispositivos se hayan actualizado.
- **Un portón hace lo contrario de lo que se muestra**: los portones se
  controlan por impulsos, el estado mostrado es el último comunicado por la
  pasarela Tydom.

Define `LOG_LEVEL=debug` para obtener todo el detalle de los registros de la
integración.
