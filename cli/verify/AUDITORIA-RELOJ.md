> Copia pública de `docs/AUDITORIA-RELOJ.md` del repositorio de coordinación (privado), hecha el 2026-10-05 tras publicar la 2.2.0. El contenido es el mismo; si alguna vez difieren, manda esta copia en este repositorio.

# Auditoría de la deriva de reloj (2026-10-05)

Pedida por Joaquín tras la desviación 4 de `reactor-block` (java-vibe-guard#20). La
pregunta: ¿qué criterios de los experimentos ya publicados (`blocking`, `blocking-kafka`)
comparan tiempos entre procesos o con relojes distintos, y les afecta?

## 1. Qué hace el reloj de este host

Medido el 2026-10-05 con un programa Java de 180 s, que muestrea
`System.currentTimeMillis()` (reloj de pared, CLOCK_REALTIME) y `System.nanoTime()`
(monotónico) cada 100 ms:

- **El reloj de pared retrocede unos 1,16 s cada ~32,3 s.** Seis saltos de −1.154 a
  −1.166 ms, en t = 11,0 / 43,3 / 75,6 / 107,7 / 140,1 / 172,3 s. Es la sincronización
  de hora de WSL2 con Windows.
- **Entre saltos, los dos relojes avanzan al mismo ritmo.**
- Desfase acumulado: −6,97 s en 181,6 s (≈ 3,6 %). Es la misma magnitud que la
  desviación 4 de `reactor-block` (unos 3,7 s en ~70 s).
- **Docker corre sobre el mismo kernel** (`docker info`: Ubuntu 24.04.4, kernel
  6.6.87.2-microsoft-standard-WSL2). El broker en contenedor lee el mismo
  CLOCK_REALTIME que la app.

Consecuencias, por tipo de medida:

| Tipo de medida | ¿Afectada? |
|---|---|
| Duración entre dos lecturas del reloj de pared (mismo proceso o no) | Sí, **si cae un salto dentro**: se acorta ~1,16 s. Probabilidad ≈ duración / 32,3 s. Los saltos solo acortan |
| Instante de un proceso comparado con el instante de otro, ambos con reloj de pared | No: el mismo reloj del kernel |
| Tiempos monotónicos de un proceso frente a tiempos de pared de otro | Sí, acumula ~3,6 % (fue el caso de `reactor-block`: el generador usaba `nanoTime`) |
| Duraciones solo con `nanoTime` en un proceso | No |

## 2. ¿Estaba activo el régimen de saltos durante los experimentos publicados?

`blocking-kafka` (ejecutado la mañana del 2026-10-04) permite comprobarlo con sus propios
datos. Cada entrega bloquea `b` medido con un temporizador monotónico y se registra con
inicio y fin en reloj de pared. Una entrega con un salto dentro mediría ~1,16 s menos de
`b`.

- **0 de 8.600 entregas** midieron menos de `b − 500 ms`, en las 30 ejecuciones. Si
  hubiera habido saltos, se esperarían unas 130 (8.632 s de bloqueo / 32,3 s / 2
  consumidores en paralelo).
- En C, 93 entregas por consumidor × 1,5 s = 139,5 s, frente a un tramo de pared de
  140 s: el mismo ritmo.
- Alineación app–broker, medida en los datos: el broker registra cada `LeaveGroup` por
  expirar el `poll` entre **1 y 12 ms después** (mediana 3) del aviso del cliente en la
  app. Son 230 pares, todos en orden causal.

**Conclusión:** durante `blocking-kafka` el reloj de pared no saltaba, y la app y el
broker estaban alineados con un margen de unos 12 ms. El régimen de saltos estaba activo
en la tarde del 2026-10-04 (`reactor-block`) y lo sigue estando hoy. No se sabe cuándo
empezó.

## 3. Criterio a criterio

### `blocking` (resultados `c4e5ddd`): **no afectado, ningún criterio**

Todo ocurre en un solo proceso y todos los tiempos son `System.nanoTime()`:
`ExperimentRunner` (llegadas, ventana de `window-seconds` en nanosegundos) y `AsyncTasks`
(envío, inicio y fin de cada tarea). El tiempo de GC sale de los MXBeans de la misma JVM.
No hay reloj de pared, ni otro proceso con el que comparar.

| Criterio | Qué compara | Veredicto |
|---|---|---|
| (a) saturación: tareas en curso, pendiente de la cola, espera en cola, ejecución | duraciones monotónicas, un proceso | no afectado |
| (b) muestras de pila | muestreo dentro de la JVM | no afectado |
| (c) el control no encola | latencias monotónicas | no afectado |
| (d) dosis–respuesta: pendiente, completadas/s | contadores y ventana monotónica | no afectado |
| (e) CPU y GC | MXBeans de la misma JVM, ventana monotónica | no afectado |

### `blocking-kafka` (resultados `a6f32ef`): **no afectado, ningún criterio**

Todos los tiempos son de pared: la app con `currentTimeMillis` y el broker con las marcas
de su log. Sería vulnerable a los saltos, pero los datos muestran que no los hubo durante
las ejecuciones (§2).

| Criterio | Qué compara | Veredicto y por qué |
|---|---|---|
| (a) T máx > M (A, E+) o < M (B, C, D, E−) | huecos entre `poll`, reloj de pared de la app, un proceso | **No afectado:** sin saltos durante las ejecuciones; los T medidos coinciden con R × b (15,02; 11,02; 9,01; 5,01; 1,50 s). *Fragilidad:* E+ supera M por 1,02 s, menos que un salto (1,16 s); con el régimen actual, una réplica podría fallar (a) en E+ por el reloj |
| (b) clasificación LEAVE_POLL_TIMEOUT / REJOIN | razón que registra el broker; REJOIN se atribuye si la salida del mismo cliente ocurrió antes | **No afectado:** el orden entre app y broker se mantiene con 1–12 ms, y el siguiente evento llega segundos después |
| (b) 0 HEARTBEAT_EXPIRATION | conteo en el log del broker | no afectado |
| (b) `poll` abierto ≥ 0,95 × M al salir | inicio del `poll` (app) frente a la salida (broker): **entre procesos** | **No afectado:** mínimo medido 1,002 × M; el margen frente a 0,95 × M es de ~520 ms, frente a una desalineación ≤ 12 ms |
| (c) ≥ 3 rebalanceos, duplicados > 0, fallos de commit > 0 | conteos; rebalanceos del broker dentro de la ventana de la app (entre procesos) | **No afectado:** relojes alineados; los conteos superan de largo el umbral |
| (d), (e) conteos de rebalanceos y duplicados | conteos en la ventana | no afectado |
| (f) broker vivo, ERROR/FATAL, CPU, GC | conteos y MXBeans | no afectado |
| (g) throughput efectivo | offsets confirmados muestreados cada 1 s por la app, ventana de 120 s de pared | **No afectado:** sin saltos, la ventana dura 120 s. Con el régimen actual tendría ~3–4 saltos y sobrestimaría en ~3,6 % |
| (h) bucle de reprocesado: ≥ 60 s seguidos sin avanzar | reloj de pared de la app | no afectado: sin saltos; además el atasco duró 120 s, lejos del umbral |
| **(b) original (desviación 2): reingreso < 5 s después de la salida** | **dos marcas del log del broker**: un solo proceso y un solo reloj | **No afectado por el reloj.** Es una duración en reloj de pared, y no hubo saltos (§2). Los valores 4,978–4,999 s coinciden con lo que fija la construcción (T − M = 15 − 10 = 5 s, menos el tiempo de tramitar la salida). El margen de 1–22 ms es real, no un error de reloj. *Fragilidad:* con el régimen actual, un salto entre la salida y el reingreso restaría ~1,16 s y lo dejaría en ~3,8 s, dentro de la ventana de 5 s. El criterio original se cumpliría más holgado por un artefacto. Y como el plazo M lo mide `kafka-clients` con el reloj de pared y `b` es monotónico, el propio retardo T − M cambiaría |

**No hace falta re-evaluar nada de `blocking` ni de `blocking-kafka`.**

## 4. `reactor-block` (#20, ya registrado como desviación 4)

Ahí sí había mezcla: los tiempos del generador salen de `nanoTime`, anclado a su reloj de
pared en t₀, y los de la app y el downstream son de reloj de pared, con el régimen de
saltos activo.
- **Afectado:** el recuento de ISE en la ventana de (d1). Ya se lee también sobre la
  ejecución completa (no decide).
- **Afectada, sin efecto en los veredictos:** la colocación de la ventana para muestras,
  CPU y downstream. Las clases son estables durante toda la ejecución.
- **No afectado:** las latencias, los resultados por petición, el throughput y el
  retraso del generador (un solo reloj).

## 5. Para los experimentos siguientes

- **Una sola referencia de tiempo.** Los criterios que deciden se calculan con un único
  reloj monotónico de un único proceso, o con conteos que no necesitan ventana.
- **Comprobación previa de reloj en el arnés:** 60 s de muestreo de pared frente a
  monotónico. Los saltos detectados quedan registrados en `env.txt`.
- Si un criterio necesita duraciones de reloj de pared, se informa de los saltos que
  caen dentro.
