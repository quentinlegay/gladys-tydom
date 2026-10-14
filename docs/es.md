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
Mosquitto instalado por la integración MQTT de Gladys.

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

## Solución de problemas

- **Ningún dispositivo en Descubrimiento**: consulta los registros del
  subcontenedor tydom2mqtt en la página de la integración. Deben aparecer
  `Connected to mqtt broker` y dispositivos `created / updated`. Una dirección
  MAC o una contraseña incorrecta se traduce en un error de autenticación
  frente a la pasarela.
- **«Broker MQTT inaccesible»**: el host debe ser accesible desde los
  contenedores de Gladys (IP local, no `localhost`), y el usuario/contraseña
  aceptados por el broker.
- **Un portón hace lo contrario de lo que se muestra**: los portones se
  controlan por impulsos, el estado mostrado es el último comunicado por la
  pasarela Tydom.

Define `LOG_LEVEL=debug` para obtener todo el detalle de los registros de la
integración.
