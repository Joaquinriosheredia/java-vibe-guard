# Validation Report — java-vibe-guard VIBE-001..007

**Engine version:** post-fix c8b1fc4 (test code exclusion applied)  
**Rules validated:** VIBE-001 (TransactionalAsync) · VIBE-002 (ReactorBlocking) · VIBE-003 (JpaN+1) · VIBE-004 (VirtualThreadsMisuse) · VIBE-005 (ConnectionPoolStarvation) · VIBE-006 (KafkaRebalance) · VIBE-007 (MdcContextLeak)

---

## Repos seleccionados

| # | Repo | Stars | Tipo | .java src |
|---|------|-------|------|-----------|
| 01 | eugenp/tutorials (spring-kafka) | ~35k | Kafka | 39 |
| 02 | spring-projects/spring-kafka | ~2.5k | Kafka | 386 (post-fix) |
| 03 | spring-cloud/spring-cloud-stream-samples | ~500 | Kafka | 129 |
| 04 | hantsy/spring-reactive-sample | ~1k | WebFlux | 602 |
| 05 | eugenp/tutorials (spring-reactive-modules) | ~35k | WebFlux | 519 |
| 06 | macrozheng/mall-swarm (gateway) | ~10k | WebFlux | 7 |
| 07 | macrozheng/mall | ~74k | JPA | 524 |
| 08 | spring-projects/spring-petclinic | ~8k | MVC | 30 |
| 09 | dyc87112/SpringBoot-Learning | ~7k | MVC | 171 |
| 10 | ityouknow/spring-boot-examples | ~28k | JPA | 31 |

---

## Repo 01 — eugenp/tutorials (spring-kafka)

- **Stars:** ~35k
- **Path:** `spring-kafka/src/main`
- **Analysis time:** 11s
- **Total issues:** 7 CRITICAL

### Findings

| Rule | Count | TP | FP | Uncertain |
|------|-------|----|----|-----------|
| VIBE-006 | 7 | 5 | 1 | 1 |

### Manual review CRITICAL

| File | Line | Classification | Reason |
|------|------|----------------|--------|
| KafkaApplication.java | 152 | TRUE_POSITIVE | `@KafkaListener(topics, containerFactory)` sin groupId; default application.properties no tiene `spring.kafka.consumer.group-id` |
| KafkaApplication.java | 158 | FALSE_POSITIVE | Usa `@TopicPartition(partitions={"0","3"})` → Spring usa `assign()` no `subscribe()`, no hay rebalanceo de grupo; groupId irrelevante |
| KafkaApplication.java | 164 | TRUE_POSITIVE | `@KafkaListener(topics, containerFactory)` sin groupId; sin global group-id |
| KafkaApplication.java | 170 | TRUE_POSITIVE | `@KafkaListener(topics, containerFactory)` sin groupId; sin global group-id |
| MultiTypeKafkaListener.java | 12 | TRUE_POSITIVE | `@KafkaListener(id="multiGroup", topics="multitype")` — `id` ≠ `groupId`; sin group-id global |
| retryable/MultiTypeKafkaListener.java | 14 | UNCERTAIN | Mismo patrón pero `application-retry.properties` define `spring.kafka.consumer.group-id=baeldung-group`; depende del perfil activo |
| ssl/KafkaConsumer.java | 20 | UNCERTAIN | `application-ssl.yml` define `group-id: demo-group-id`; cubierto cuando perfil ssl activo |

### Notes
- La regla no analiza `application.properties`/`application.yml` para detectar `spring.kafka.consumer.group-id` configurado vía Spring Boot auto-config → genera falsos positivos cuando el groupId está en properties, no en anotación.
- FP claro: `@TopicPartition` con particiones explícitas usa `assign()` API, no `subscribe()` — el rebalanceo de grupo no aplica.
- FP rate VIBE-006 en este repo: 1/7 = 14% (por debajo del umbral 20%).

---

## Repo 02 — spring-projects/spring-kafka

- **Commit pineado:** `3c4bf1b71ff4a5f4df0f1a147f7a430342208074` (2026-09-03, clon shallow --depth 1)
- **Engine:** jar `1.0.0-SNAPSHOT` recompilado 2026-09-01 13:07, mcp-server/ en HEAD `8c80388` (sin cambios desde el rebuild — verificado `git status`/`git log --since` limpios), incluye el fix de exclusión de test `c8b1fc4` (confirmado `git merge-base --is-ancestor c8b1fc4 HEAD`).
- **Path:** repo completo (`spring-kafka/`)
- **Archivos escaneados:** 386 (625 totales − 239 excluidos por filtro `/test/`+`*Test.java`+`*IT.java` — coincide con el "386 (post-fix)" ya anotado en la tabla de repos seleccionados)
- **Total issues:** 23 (0 CRITICAL, 0 MAJOR, 23 WARNING — todas VIBE-006)

> **Confirmación de la re-invalidación previa:** la corrida anterior con el jar `0.1.0` produjo 212 hallazgos, 189 (89%) dentro de `/test/`. Esta corrida, con el jar recompilado apuntando al mismo repo (commit distinto, pero mismo módulo `spring-kafka-test` excluido), produce 23 — cero hallazgos dentro de rutas `/test/`. El fix de exclusión funciona.

### Manual review — TODOS los 23 hallazgos (VIBE-006, WARNING "groupId not found")

| # | File:Line | Clasificación | Motivo |
|---|---|---|---|
| 1 | samples/sample-04/.../Application.java:49 | **FALSE_POSITIVE** | `@KafkaListener(id = "fooGroup", topics = "topic4")` — sin `groupId=` pero con `id=` y sin `idIsGroup=false` visible |
| 2 | samples/sample-03/.../Application.java:92 | **FALSE_POSITIVE** | `@KafkaListener(id = "fooGroup2", topics = "topic2")` — mismo patrón |
| 3 | samples/sample-03/.../Application.java:100 | **FALSE_POSITIVE** | `@KafkaListener(id = "fooGroup3", topics = "topic3")` — mismo patrón |
| 4 | samples/sample-01/.../Application.java:74 | **FALSE_POSITIVE** | `@KafkaListener(id = "fooGroup", topics = "topic1")` — mismo patrón |
| 5 | samples/sample-01/.../Application.java:83 | **FALSE_POSITIVE** | `@KafkaListener(id = "dltGroup", topics = "topic1-dlt")` — mismo patrón |
| 6 | samples/sample-02/.../MultiMethods.java:40 | **FALSE_POSITIVE** | `@KafkaListener(id = "multiGroup", topics = {...})` — mismo patrón |
| 7 | spring-kafka-docs/.../dynamic/MyPojo.java:49 | **FALSE_POSITIVE** | `@KafkaListener(id = "#{__listener.id}", ...)` — `id` vía SpEL, mismo patrón |
| 8 | spring-kafka-docs/.../requestreply/Application.java:121 | **FALSE_POSITIVE** | `@KafkaListener(id = "myId", ...)` — mismo patrón |
| 9 | spring-kafka-docs/.../started/consumer/Application.java:51 | **FALSE_POSITIVE** | `@KafkaListener(id = "myId", topics = "topic1")` — mismo patrón |
| 10 | spring-kafka-docs/.../started/noboot/Listener.java:32 | **FALSE_POSITIVE** | `@KafkaListener(id = "listen1", topics = "topic1")` — mismo patrón |
| 11 | spring-kafka/.../annotation/EnableKafka.java:120 | **FALSE_POSITIVE** | `&#064;KafkaListener(...)` dentro de `<pre class="code">` Javadoc — no es una anotación real |
| 12 | spring-kafka/.../config/ShareKafkaListenerContainerFactory.java:121 | **FALSE_POSITIVE** | mención `@KafkaListener` en prosa Javadoc (`{@code @KafkaListener}`), sin anotación real en la línea |
| 13 | spring-kafka/.../listener/ShareKafkaMessageListenerContainer.java:150 | **FALSE_POSITIVE** | Javadoc de `getClientId()`, ninguna anotación real en el rango |
| 14 | spring-kafka/.../listener/adapter/BatchMessagingMessageListenerAdapter.java:129 | **FALSE_POSITIVE** | Javadoc de `setMessagingConverter()`, ninguna anotación real en el rango |
| 15 | spring-kafka/.../event/ListenerContainerNoLongerIdleEvent.java:88 | **FALSE_POSITIVE** | Javadoc `"The id of the listener (if {@code @KafkaListener})..."` — mención textual, no anotación |
| 16 | spring-kafka/.../event/ListenerContainerPartitionIdleEvent.java:90 | **FALSE_POSITIVE** | idéntico a #15 |
| 17 | spring-kafka/.../event/ListenerContainerPartitionNoLongerIdleEvent.java:84 | **FALSE_POSITIVE** | idéntico a #15 |
| 18 | spring-kafka/.../event/NonResponsiveConsumerEvent.java:91 | **FALSE_POSITIVE** | idéntico a #15 |
| 19 | spring-kafka/.../event/ListenerContainerIdleEvent.java:94 | **FALSE_POSITIVE** | idéntico a #15 |
| 20 | spring-kafka/.../retrytopic/RetryTopicConfigurer.java:150 | **FALSE_POSITIVE** | `<pre><code>@KafkaListener(topics = "my-annotated-topic")...</code></pre>` en Javadoc de clase — ejemplo, no código real |
| 21 | RetryTopicConfigurer.java:162 | **FALSE_POSITIVE** | idéntico bloque Javadoc, segundo ejemplo (`@KafkaListener` sobre clase) |
| 22 | RetryTopicConfigurer.java:175 | **FALSE_POSITIVE** | idéntico bloque Javadoc, tercer ejemplo |
| 23 | RetryTopicConfigurer.java:190 | **FALSE_POSITIVE** | bloque Javadoc, ejemplo vía meta-anotación |

**Resultado: 23/23 FALSE_POSITIVE. 0 TP, 0 contextual, 0 incierto.**

### Notas
- Repo 02 es la librería spring-kafka en sí: `spring-kafka/` (core, producción) + `spring-kafka-docs/` y `samples/` (código de ejemplo/tutorial declarado como tal por la propia estructura del repo — mismo criterio de cautela contextual que `ConsumerSimulator.java`/`FileContentSearchService.java`, aunque aquí la clasificación FALSE_POSITIVE ya es válida por motivo técnico, independiente del carácter demo).
- FP rate VIBE-006 en este repo: 23/23 = 100% — muy por encima del umbral 20% ya usado como referencia en repo 01.
- Verificado en el propio `mcp-server` (solo lectura, SIN modificar nada): `KafkaRebalanceHazardRule.java` nunca comprueba el atributo `id()` (solo el regex `groupId\s*=\s*"..."`, línea 58), pese a que `KafkaListener.java:184-191` (Javadoc oficial del framework) documenta `idIsGroup() default true` — "When groupId is not provided, use the id (if provided) as the group.id property... Set to false, to use the group.id from the consumer factory." Explica los 10 FP de #1-10.
- Verificado también: `noComment()`/`codeOnly()` (`KafkaRebalanceHazardRule.java:232-241`) solo eliminan comentarios `//` — nunca manejan bloques `/* */` ni `/** */` (Javadoc). Explica los 13 FP de #11-23, todos texto `@KafkaListener` dentro de bloques Javadoc.
- **Candidatos a investigación futura (NO corregidos durante esta validación — ver sección dedicada más abajo).**

### Post-fix re-analysis (2026-09-05, commit `621496a`)

Mismo commit pineado (`3c4bf1b71ff4a5f4df0f1a147f7a430342208074`), clon fresco, engine reconstruido desde `mcp-server` HEAD `621496a` (fix de `id`/`idIsGroup` + comentarios de bloque). Método: runner standalone (`Repo02Scan.java`) sobre `target/classes`, no el servidor MCP — ver nota de incidente en la conversación (proceso stdio colgado con el jar pre-fix cargado, matado y no reconectado).

- **Archivos escaneados:** 386 (idéntico al pre-fix)
- **Total issues VIBE-006:** **0** (antes: 23)
- Los 23 file:line de la tabla de arriba se verificaron uno a uno por re-ejecución: ninguno reaparece.
- Verificación adicional de falsos negativos nuevos: de los 38 usos textuales de `@KafkaListener` en el repo, 14 son anotaciones reales; 12 tienen `id=`/`groupId=` válido (correctamente suprimidas); 2 (`sample-05/Sample05Application.java:39`, `sample-08/Sample08Application.java:43`) caen en un gap preexistente y no relacionado — el método listener es package-private (sin `public/protected/private` explícito) y `METHOD_OPEN` no lo reconoce, tanto antes como después de este fix (no aparecían en los 23 originales tampoco). No es un falso negativo nuevo — está fuera del alcance de este fix, anotado como candidato adicional en la sección de investigación futura.

---

## Repo 03 — spring-cloud/spring-cloud-stream-samples

- **Commit pineado:** `2ff1168833cfcab14d2251219dad15a8919c1672` (2025-02-24, HEAD del repo al clonar el 2026-09-05 — no había commit pineado previo para este repo; se fija ahora como HEAD del momento del clon shallow `--depth 1`).
- **Engine:** clases compiladas desde `mcp-server` HEAD `621496a` (incluye el fix de VIBE-006 de hoy: id/idIsGroup + comentarios de bloque). **Nota de método:** el servidor MCP `java-vibe-guard` sigue desconectado desde el incidente del repo 02 (maté el proceso stdio que tenía el jar pre-fix cargado en memoria; no se reconectó solo — confirmado con `ToolSearch`, ver conversación). Se usó de nuevo el runner standalone (`RepoScan.java`, ahora extendido a las 7 reglas VIBE-001..007), instanciando las reglas directamente sobre `target/classes` recompilado desde `621496a` — mismo criterio de transparencia que en repo 02.
- **Path:** repo completo
- **Archivos escaneados:** 93 (129 totales − 36 excluidos por `/test/`+`*Test.java`+`*Tests.java`+`*IT.java` — el "129" ya coincide con la tabla de repos seleccionados)
- **Total issues (las 7 reglas):** **0**

> **Naturaleza del repo — declarado ANTES de clasificar (mismo criterio que `ConsumerSimulator.java`):** `spring-cloud-stream-samples` es, en su totalidad, un repositorio oficial de **samples/tutoriales** de Spring Cloud Stream (nombres de módulo: `kafka-batch-sample`, `testing-demo`, `kafka-streams-interactive-query`, etc.) — no hay módulos de producción. Cualquier hallazgo aquí tendría que evaluarse con esa cautela contextual; en este caso no hace falta porque no hubo ningún hallazgo que evaluar.

### Auditoría manual de señales candidatas (0 findings → verificar que es TRUE_NEGATIVE, no hueco del detector)

Con 0 findings no hay nada que clasificar TP/FP/CONTEXTUAL directamente, así que en su lugar audité manualmente cada patrón que alguna de las 7 reglas podría en teoría enganchar, para confirmar que el 0 es correcto y no un falso negativo:

| Señal | Ocurrencias (fuera de /test/) | Archivo:línea | Veredicto | Motivo |
|---|---|---|---|---|
| `@KafkaListener` | 2 | `batch-producer-consumer/.../CloudStreamsFunctionBatch.java:63`, `kafka-batch-sample/.../KafkaBatchSampleApplication.java:47` | **TRUE_NEGATIVE** | Ambos con `id = "batch-out"`, sin `idIsGroup = false` → `id` actúa como `groupId` efectivo tras el fix de hoy (VIBE-006). Confirma que el fix generaliza correctamente a un repo nuevo, no solo a los fixtures. |
| `Thread.sleep` (fuera de test) | 1 | `kafka-streams-interactive-query/.../GenerateProducts.java:72` | **TRUE_NEGATIVE** | Dentro de `public static void main(...)` de un generador standalone de eventos de prueba — no hay `@KafkaListener` ni `@Transactional` en el archivo; `main()` está en la lista de exclusión explícita de ambas reglas (VIBE-005/VIBE-006). |
| `@Transactional` | 1 | `transaction-spring-data-processor/.../ProcessorApplication.java:104` | **TRUE_NEGATIVE** | `javax.transaction.Transactional` en `TxCode.run(PersonEvent)`; el cuerpo solo hace `repository.save(...)` — ninguna llamada bloqueante de la lista de VIBE-001/VIBE-005 (`.get/.join/.block/.blockFirst/.blockLast`, `Thread.sleep`, `RestTemplate.*`, etc.), y la clase no es `@RestController` → ninguna de las dos reglas debía disparar. |
| `RestTemplate` (fuera de test) | 1 archivo (2 usos) | `kafka-streams-interactive-query/.../ProductQueryController.java:57,76` | **TRUE_NEGATIVE** | Es un `@RestController` normal — no está dentro de ningún método `@Transactional` ni `@KafkaListener`, así que ni VIBE-005 ni VIBE-006 aplican (su gate exige la anotación explícita en el mismo archivo). |
| JPA (`@Entity`) | 2 archivos | `kinesis-produce-consume/.../Order.java`, `transaction-spring-data-processor/.../Person.java` | **TRUE_NEGATIVE** | Son solo las entidades; no hay `@OneToMany`/`@ManyToMany` ni acceso en bucle a colecciones lazy en los repositorios del módulo — no hay patrón N+1 que VIBE-003 pueda enganchar. |
| Virtual threads / `MDC.*` / `ExecutorService`/`CompletableFuture` | 0 | — | **TRUE_NEGATIVE** | El repo no usa ninguno de estos patrones; VIBE-004 y VIBE-007 no tienen superficie que analizar aquí. |

**Conclusión repo 03: 0 findings, 0 falsos positivos, 0 falsos negativos detectados** — verificado por auditoría de las señales candidatas, no solo por ausencia de output. El repo es demasiado pequeño y su único uso real de `@KafkaListener` ya queda correctamente cubierto por el fix de hoy.

### Hallazgo adicional de alcance — TransactionalAsyncRule (VIBE-001) sin ningún comment-stripping

Surgido al verificar por qué el `@Transactional` de `ProcessorApplication.java` no se marcaba (no por el bug, sino al leer el código de la regla para descartarlo): `grep -L "codeOnly\|stripComments" *.java` en `mcp-server/.../rules/` muestra que **`TransactionalAsyncRule.java` (VIBE-001) es la única de las 7 reglas que no elimina comentarios en absoluto** — ni siquiera `//` de línea, a diferencia de las otras 6 (que sí tienen `codeOnly()`/`stripComments()`, aunque las 5 restantes distintas de VIBE-006 sigan sin manejar `/* */`). `TRANSACTIONAL_ANNOTATION.matcher(trimmed)` y `BLOCKING_CALL.matcher(trimmed)` (líneas 55 y 73 de `TransactionalAsyncRule.java`) operan directamente sobre la línea cruda. No se manifestó en repo 03 (ningún `@Transactional`/`.get()`/`.block()` cae dentro de un comentario o string literal en este repo), así que no es un finding de repo 03 en sí — es un hallazgo de calidad del detector, más severo que el ya registrado para las otras 5 reglas (aquí falta también el `//`, no solo el bloque). **Candidato a investigación futura, mismo tratamiento — NO corregido ahora.**

---

## Repo 04 — hantsy/spring-reactive-sample

- **Commit pineado:** `f4ff9595c3330cb066f6c97b729301ee6dcd32e1` (2026-08-19, HEAD del repo al clonar el 2026-09-05 — no había commit pineado previo; se fija ahora, documentado igual que repo 03).
- **Engine:** clases compiladas desde `mcp-server` HEAD `621496a` (working tree limpio, verificado `git status`). **Método:** servidor MCP `java-vibe-guard` sigue desconectado (mismo incidente de repo 02/03) — runner standalone `RepoScan.java` (7 reglas) sobre `target/classes`.
- **Path:** repo completo
- **Archivos escaneados:** 452 (631 totales − 179 excluidos por `/test/`+`*Test.java` — la tabla de repos seleccionados anotaba "602"; la diferencia es esperable, el repo ha evolucionado desde que se hizo esa tabla, no es un error de filtrado).
- **Total issues (las 7 reglas):** **8** — todas VIBE-002 (ReactorBlockingCallRule), 0 en las otras 6.

> **Naturaleza del repo — declarado ANTES de clasificar:** `spring-reactive-sample` es, en su totalidad, un repositorio oficial de **samples** (nombre literal del repo) — cada módulo top-level (`data-mongo`, `data-redis`, `boot-data-neo4j-rx`, etc.) es una demo aislada de un datastore reactivo distinto, sin módulos de producción. Mismo criterio de cautela contextual que `ConsumerSimulator.java`.

### Los 8 findings VIBE-002 (todos `.block()`/`.blockLast()` dentro de `@Component`)

| # | File:Line | Clasificación | Motivo |
|---|---|---|---|
| 1 | `data-mongo-pageable/.../DataInitializer.java:45` | **TRUE_POSITIVE** (contexto demo) | `@Component` + `@EventListener(ContextRefreshedEvent.class) init()` — `.blockLast()` real, atribución correcta (no es `@PostConstruct`/`@Test`/`main()`, ninguna exclusión aplica). |
| 2 | `data-redis/.../DataInitializer.java:51` | **TRUE_POSITIVE** (contexto demo) | Mismo patrón `@EventListener(ContextRefreshedEvent.class) init()`, `.block()` sobre `conn.keyCommands()...count()`. |
| 3 | `data-redis/.../DataInitializer.java:58` | **TRUE_POSITIVE** (contexto demo) | Mismo método, `.block()` anidado como argumento de `.sAdd(...)` — atribución correcta pese al anidamiento. |
| 4 | `data-redis/.../DataInitializer.java:70` | **TRUE_POSITIVE** (contexto demo) | Mismo método, tercer `.block()` sobre `keyCommands.randomKey()...`. |
| 5 | `legacy/boot-data-neo4j-rx/.../DemoApplication.java:56` | **TRUE_POSITIVE** (contexto demo) | Segunda clase del archivo (`DataInitializer implements CommandLineRunner`, `@Component`) — `.blockLast()` con comentario del propio autor: `// to make \`IntegrationTests\` work.` — trade-off reconocido explícitamente por el desarrollador. |
| 6 | `legacy/boot-data-r2dbc-auditing/.../DataInitializer.java:42` | **TRUE_POSITIVE** (contexto demo) | `@Component implements ApplicationRunner`, `.block(Duration.ofSeconds(5))` — el regex `\.\s*(block\|blockFirst\|blockLast)\s*\(` matiza correctamente incluso con el overload `block(Duration)`. |
| 7 | `legacy/boot-neo4j-rx-cypher/.../DemoApplication.java:56` | **TRUE_POSITIVE** (contexto demo) | Idéntico patrón a #5, mismo comentario del autor sobre `IntegrationTests`. |
| 8 | `legacy/boot-neo4j-rx/.../DemoApplication.java:60` | **TRUE_POSITIVE** (contexto demo) | Idéntico patrón a #5/#7, sin el comentario explicativo pero mismo idiom. |

**Resultado: 8/8 TRUE_POSITIVE — verificado, no un bug del detector.**

### Verificación de la mecánica del detector (mismo rigor que el caso `UserService.java`/CLI)

Antes de aceptar los 8 como correctos, verifiqué específicamente el tipo de bug que motivó A3.1/A3.2 en `blocking.js` (atribución por ventana de líneas fija en vez de límites estructurales reales), porque es exactamente el terreno donde ese tipo de error aparece:

- **Atribución cruzada entre clases en el mismo archivo:** los 3 casos `legacy/boot-*-neo4j-rx*` tienen DOS clases top-level por archivo (`DemoApplication` con `main()`, luego `DataInitializer` con `@Component`). Confirmé línea por línea (`cat -n`) que `braceDepth`/`classDepth` se resetean correctamente al cerrar `DemoApplication` antes de que `inReactiveClass` se reactive con `DataInitializer` — el `.blockLast()` reportado es el de `DataInitializer.run()`, no hay fuga desde `DemoApplication.main()` ni viceversa.
- **Anidamiento como argumento:** `data-redis/.../DataInitializer.java:58` tiene `.block()` como argumento de otra llamada (`.sAdd(..., this.posts.findAll()...collectList().block())`) — se atribuye correctamente a la línea real, no se pierde ni se duplica.
- **A diferencia del CLI (JS) antes de A3.2**, el motor Java (`ReactorBlockingCallRule`) ya usaba desde el principio un contador de `braceDepth` real para los límites de método/clase, no una ventana fija de N líneas — **no hay equivalente al bug A3.2 en este engine**. Confirmado por lectura de código, no solo por ausencia de síntomas en este repo.

### Nota contextual (no cambia la clasificación, pero es relevante para el batch de fixes)

6 de los 8 hallazgos (#1-4 vía `@EventListener(ContextRefreshedEvent.class)`, y los 3 `CommandLineRunner`/`ApplicationRunner` de #5-6-7-8, que se solapan parcialmente) siguen el mismo idiom: **inicialización de datos en el arranque, bloqueando a propósito**. El propio docstring de `ReactorBlockingCallRule` ya excluye `@PostConstruct` con la razón "initialization runs once at startup, blocking is acceptable" — `CommandLineRunner`/`ApplicationRunner`/`@EventListener(ContextRefreshedEvent)` cumplen la misma función en código reactivo moderno (donde `@PostConstruct` es más restrictivo) pero no están en la lista de exclusión. No lo clasifico como FALSE_POSITIVE porque el riesgo real (bloquear un hilo) sigue siendo técnicamente cierto y `ContextRefreshedEvent` puede dispararse más de una vez en contextos jerárquicos — pero es un patrón repetido y consistente que merece evaluarse como posible ampliación de la lista de exclusiones cuando se decida el batch de fixes. **No corregido ahora.**

---

## Repo 05 — eugenp/tutorials (spring-reactive-modules)

- **Commit pineado:** `bc8dc1884888f2ced63a1f739f4bf8677f929f60` (2026-09-03, HEAD del monorepo `eugenp/tutorials` al clonar el 2026-09-05 — no había commit pineado previo para este scope; distinto del commit de repo 01, que es un pineado anterior y no se re-abre aquí).
- **Engine:** clases compiladas desde `mcp-server` HEAD `621496a`. **Método:** servidor MCP sigue desconectado — runner standalone `RepoScan.java` (7 reglas) sobre `target/classes`.
- **Path:** `spring-reactive-modules/` (mismo monorepo que repo 01, subcarpeta distinta — repo 01 usa `spring-kafka/src/main`, no se re-analiza aquí).
- **Archivos escaneados:** 384 (519 totales − 135 excluidos por `/test/`+`*Test.java` — el "519" coincide exactamente con la tabla de repos seleccionados).
- **Total issues (las 7 reglas):** **8** — todas VIBE-002, 0 en las otras 6.

> **Naturaleza del repo — evaluado módulo por módulo, NO "todo tutorial" de forma uniforme** (mismo criterio ya establecido en repo 01, donde 5/7 CRITICAL fueron TRUE_POSITIVE pese a ser código de `eugenp/tutorials`): este scope (`spring-reactive-modules`) es, en conjunto, código de acompañamiento de artículos de Baeldung — pero eso no determina la clasificación por sí solo. Distingo explícitamente dos categorías entre los 8 findings:
> - **Exhibición pedagógica auto-documentada** (`FileContentSearchService.java` — mismo archivo ya catalogado previamente en memoria junto a `ConsumerSimulator.java` como demo/simulación descartada): los propios nombres de método (`blockingSearch`, `workableBlockingSearch`, `incorrectUseOfSchedulersSearch`, `nonBlockingSearch`) son la lección — no representan un descuido accidental.
> - **Patrón arquitectónicamente realista** (`CustomerInfoService.java`, paquete `synchronous.gateway`): una fachada síncrona sobre llamadas reactivas (`WebClient`) agregando dos respuestas — patrón genuinamente usado en producción real (gateways que agregan varias llamadas reactivas para devolver una respuesta síncrona), no una demostración de "cómo NO hacerlo".

### Los 8 findings VIBE-002

| # | File:Line | Clasificación | Motivo |
|---|---|---|---|
| 1-5 | `spring-reactive-4/.../FileContentSearchService.java:40,53,63,76,87` | **TRUE_POSITIVE** (exhibición pedagógica) | `@Service`, 5 métodos cuyos propios nombres describen la técnica que ilustran (bloqueo simple, bloqueo en `boundedElastic`, mal uso de `Schedulers`, thread pool custom, `Schedulers.parallel()`) — atribución mecánica correcta, pero es un exhibit didáctico deliberado, no un bug accidental. |
| 6 | `spring-reactive-client-2/.../CustomerInfoService.java:43` | **TRUE_POSITIVE, pero CONTEXTUAL por alcanzabilidad** | Dentro de `getCustomerInfoBlockEach(...)`, un método **privado actualmente inalcanzable**: el único llamador (`getCustomerInfo()`, línea 27-32) tiene la llamada comentada (`// return getCustomerInfoBlockEach(customerId);`) y usa `getCustomerInfoBlockCombined(...)` en su lugar. El patrón es real y se ejecutaría si se reactivara, pero el análisis estático línea-por-línea no puede saber que es código muerto — limitación compartida por prácticamente cualquier analizador basado en regex/texto, no un bug específico de esta regla. |
| 7 | `spring-reactive-client-2/.../CustomerInfoService.java:53` | **TRUE_POSITIVE, pero CONTEXTUAL por alcanzabilidad** | Mismo método inalcanzable que #6. |
| 8 | `spring-reactive-client-2/.../CustomerInfoService.java:78` | **TRUE_POSITIVE** (sin matiz — código activo) | Dentro de `getCustomerInfoBlockCombined(...)`, el método SÍ invocado por `getCustomerInfo()` (línea 31) — `Mono.zip(...).block()` combinando dos llamadas reactivas en una sola espera. Patrón real, alcanzable, arquitectónicamente plausible en producción (fachada síncrona de agregación). |

**Resultado: 8/8 TRUE_POSITIVE por mecánica del detector — 5 son exhibición didáctica explícita, 2 son código muerto actualmente inalcanzable (mismo patrón, distinto método), 1 es código activo y arquitectónicamente representativo de un riesgo real.**

### Verificación de la mecánica del detector — mismo rigor que `UserService.java` (CLI)

- **Cobertura del universo de `.block()`/`.blockFirst()`/`.blockLast()` en el scope:** 21 archivos (fuera de test) contienen alguna de estas llamadas; solo 2 fueron flagueados (8 findings). Auditoría de una muestra representativa de los 19 restantes (`ReaderConsumerServiceImpl.java`, `ChannelClient.java` [rsocket], `LargeFileDownloadWebClient.java`) confirma **TRUE_NEGATIVE por diseño**: ninguno tiene `@Service`/`@Component`/`@RestController` en el archivo — son clases cliente (`WebClient`/RSocket) invocadas desde `main()` o desde otro bean, fuera del gate explícito de la regla. No se auditaron los 19 uno a uno por volumen, pero el patrón es arquitectónicamente consistente en los 3 revisados.
- **🔴 Hallazgo relevante — falso negativo confirmado por reproducción directa (no solo lectura de código):** `spring-webflux-2/.../threadstarvation/ThreadStarvationApp.java` — nombre del paquete literalmente "threadstarvation", terreno natural de VIBE-002. Contiene una clase interna `@RestController class RestApi` con un método `warning()` que llama a `.block()` (línea 50) — y el propio autor del tutorial ya anotó ese método con `@SuppressWarnings("BlockingMethodInNonBlockingContext")`, reconociendo explícitamente que es el anti-patrón. **VIBE-002 no lo detecta.** Causa raíz confirmada con un fixture mínimo reproducido aparte (no en el repo): `warning()` está declarado sin modificador de visibilidad (`Mono<String> warning() {`, package-private) — `METHOD_OPEN` exige `public|protected|private` explícito, así que `inMethod` nunca se activa y el `.block()` nunca se escanea. **Esto no es un bug aislado de VIBE-002** — es el mismo gap ya registrado para VIBE-006 en repo 02, ahora confirmado en una segunda regla por reproducción directa, lo que lo eleva a hallazgo sistémico (ver sección centralizada "Candidatos a investigación futura", nota actualizada). El método hermano `getBlocking()` (línea 29) tiene el mismo problema de modificador pero usa `Thread.sleep()`, fuera de la superficie de detección de VIBE-002 de todas formas (no es `.block()`/`.blockFirst()`/`.blockLast()`/`.toFuture().get()`).

### Auditoría de las otras 6 reglas (0 findings)

Verificado por grep de señales candidatas, igual que en repos 03/04: sin `@KafkaListener` (ni siquiera en el módulo `spring-reactive-kafka` — usa la API funcional `KafkaReceiver` de Reactor Kafka, no el listener-container de Spring), sin `@Transactional`, sin `MDC.*`, sin virtual threads, sin `@Entity`/`JpaRepository`, sin `HikariDataSource` fuera de test. **TRUE_NEGATIVE confirmado en las 6.**

---

## Repo 06 — macrozheng/mall-swarm (gateway)

- **Commit pineado:** `04c442fe318356bae4445a109dde7af297ce1e84` (2026-05-21, HEAD del repo al clonar el 2026-09-06 — no había commit pineado previo, se fija ahora, mismo criterio que repos 03/04/05).
- **Path:** `mall-gateway/` — módulo gateway del monorepo `macrozheng/mall-swarm`.
- **Engine:** clases compiladas desde `mcp-server` HEAD `621496a` (working tree limpio, `mvn -o compile` recompilado sin descargas). **Método:** servidor MCP `java-vibe-guard` sigue desconectado (mismo incidente de repos 02-05) — runner standalone `RepoScan.java` (7 reglas VIBE-001..007) instanciando las reglas directamente sobre `target/classes`, mismo criterio de transparencia que en repos anteriores.

### Naturaleza del módulo

`mall-gateway` es el API Gateway del sistema de microservicios (Spring Cloud Gateway, `spring-cloud-starter-gateway-server-webflux` en `pom.xml` — **confirmado WebFlux real**, no solo nombre). Contiene únicamente 7 archivos `.java` en `src/main` (el volumen estimado se confirma exacto): la clase de arranque, configuración de CORS/Redis/Sa-Token, un componente de autorización (`StpInterfaceImpl`) y una clase utilitaria de autenticación (`StpMemberUtil`, copia de la librería `sa-token` adaptada). No hay controladores, repositorios JPA, listeners Kafka ni lógica de negocio propia — es infraestructura de enrutamiento/autenticación, consistente con lo esperado de un gateway.

### Resultado del escaneo (7 reglas)

**0 findings** en los 7 archivos escaneados.

### Auditoría de TRUE_NEGATIVE (mismo rigor que repo 03 — no solo ausencia de output)

Grep exhaustivo de las señales de entrada (gates) de las 7 reglas sobre todo el módulo (`src/main` + `src/test`):

| Regla | Señal de entrada requerida | Resultado |
|---|---|---|
| VIBE-001 (`@Transactional` + blocking) | `@Transactional` | 0 ocurrencias |
| VIBE-002 (`.block()`/`.blockFirst()`/`.blockLast()`/`.toFuture().get()` en clase reactiva) | `import reactor.core.publisher.*` + llamadas bloqueantes | 0 ocurrencias de ambas |
| VIBE-003 (N+1 JPA) | `@Repository` / `extends *Repository` / `import jakarta.persistence` | 0 ocurrencias; `pom.xml` no tiene `spring-boot-starter-data-jpa` |
| VIBE-004 (virtual threads) | `Thread.ofVirtual` / `newVirtualThreadPerTaskExecutor` / `synchronized` | 0 ocurrencias |
| VIBE-005 (connection pool starvation) | `@Transactional` | 0 ocurrencias (mismo gate que VIBE-001) |
| VIBE-006 (`@KafkaListener`) | `@KafkaListener` / `import org.springframework.kafka` | 0 ocurrencias; `pom.xml` no tiene `spring-kafka` |
| VIBE-007 (MDC leak) | `MDC.` / `@Async` / `@Scheduled` | 0 ocurrencias |

**Conclusión repo 06: 0 findings, TRUE_NEGATIVE confirmado por auditoría de señales, no solo por ausencia de output.** El módulo no toca ninguna de las 7 superficies de riesgo — arquitectónicamente coherente con ser un gateway de enrutamiento sin JPA, Kafka ni lógica transaccional propia. Tampoco hay métodos package-private con patrones de riesgo dentro (todos los métodos de los 7 archivos son `public` o `private`), así que el gap sistémico de `METHOD_OPEN` (ver sección "Candidatos a investigación futura") no tiene superficie en este repo.

### Nota contextual — no es un finding, no cambia la clasificación (atención especial a VIBE-002 por ser WebFlux, según protocolo)

`SaTokenConfig.java` registra un `SaReactorFilter` (filtro reactivo global de Sa-Token) cuyo callback `.setAuth(obj -> { ... })` ejecuta `redisTemplate.opsForHash().entries(...)` — una llamada **síncrona/bloqueante** sobre `RedisTemplate` (no `ReactiveRedisTemplate`) dentro de lo que es, arquitectónicamente, un filtro reactivo de un gateway WebFlux. Es exactamente la familia de antipatrón que este catálogo de reglas persigue (bloqueo dentro de un contexto no bloqueante) — pero **no es un finding de VIBE-002** porque la superficie de detección de esa regla está definida explícitamente como llamadas `.block()`/`.blockFirst()`/`.blockLast()`/`.toFuture().get()`, no "cualquier API bloqueante usada en contexto reactivo" en general. `SaTokenConfig.java` ni siquiera importa `reactor.core.publisher.*`, así que el gate `inReactiveClass` de VIBE-002 no se activa para este archivo. **No es un bug del detector ni un caso del gap sistémico ya registrado** — es una limitación de alcance conocida y ya implícita en la definición de la regla (detecta el método reactivo `.block()`, no el uso de APIs bloqueantes de terceros como `RedisTemplate`). Se deja anotado como observación manual, sin abrir un candidato nuevo de investigación futura, porque no revela un fallo de mecanismo — solo confirma que la regla hace exactamente lo que dice hacer, ni más ni menos.

---

## Repo 07 — macrozheng/mall

- **Commit pineado:** `0504e86b1f1b6f1b8aa6a734d37a90fb67346be7` (2026-05-14, HEAD del repo al clonar el 2026-09-06 — no había commit pineado previo, se fija ahora).
- **Path:** raíz del monorepo — 7 módulos Maven: `mall-common`, `mall-mbg`, `mall-security`, `mall-demo`, `mall-admin`, `mall-search`, `mall-portal`.
- **Engine:** clases compiladas desde `mcp-server` HEAD `621496a` (mismo build que repo 06). **Método:** servidor MCP desconectado (mismo incidente que repos 02-06) — `RepoScan.java` (7 reglas) sobre `target/classes`.

### Naturaleza del repo — mucho más grande que gateway, arquitectura tradicional (no reactiva)

`macrozheng/mall` es la plataforma backend completa de un e-commerce: `mall-admin` (backend de gestión, 154 `.java`), `mall-portal` (API de cara al cliente, 86 `.java`), `mall-mbg` (código generado por MyBatis Generator — DAOs/mappers/modelos, 230 `.java`, boilerplate de bajo riesgo), `mall-security` (config Spring Security + JWT, 14), `mall-common` (utilidades compartidas, 14), `mall-search` (integración Elasticsearch, 12) y `mall-demo` (módulo de demostración explícitamente declarado como tal en su propio `pom.xml`: `<description>mall-demo for mall</description>` — mismo criterio de cautela contextual que `ConsumerSimulator.java` en repo 01, aunque aquí no llegó a hacer falta porque no generó ningún finding). Confirmado por `pom.xml`: **MyBatis** (no JPA — `mybatis-spring-boot-starter`), **Spring MVC tradicional** (`spring-boot-starter-web`, sin `webflux`/`reactor` en ningún módulo), **RabbitMQ** (`spring-boot-starter-amqp` en mall-portal, no Kafka), Redis/MongoDB/Elasticsearch como almacenes de datos, Druid como pool de conexiones. Patrón de capas: Controller → Service (interfaz + Impl separados) → Mapper (MyBatis).

### Resultado del escaneo (7 reglas)

**0 findings** en 519 archivos escaneados (excluidos test).

### Auditoría de TRUE_NEGATIVE (grep de los 7 gates + revisión de dependencias — no solo ausencia de output)

| Regla | Señal de entrada | Resultado | Verificación adicional |
|---|---|---|---|
| VIBE-001 (`@Transactional` + blocking) | `@Transactional` | **19 archivos SÍ tienen la señal** (mall-admin/mall-portal) | Ver nota estructural abajo — confirmado que ninguno contiene una llamada bloqueante real (`CompletableFuture`/`Future`/`.join()`/`.block()`: **0 ocurrencias en todo el repo**) |
| VIBE-002 (`.block()`-family en clase reactiva) | `import reactor.core.publisher.*` | 0 ocurrencias | `pom.xml` de ningún módulo tiene `webflux`/`reactor` — arquitectura 100% Spring MVC/servlet |
| VIBE-003 (N+1 JPA) | `@Service`/`@Component` + variable `*Repository*`/`*Repo*` en loop, o colección lazy en loop | 0 ocurrencias | Ver nota de alcance abajo — MyBatis usa `*Mapper*`, fuera del alcance declarado de la regla por diseño |
| VIBE-004 (virtual threads) | `Thread.ofVirtual`/`newVirtualThreadPerTaskExecutor`/`synchronized` | 0 ocurrencias | Ni una sola vez en 519 archivos |
| VIBE-005 (connection pool starvation) | `@Transactional` (mismo gate que VIBE-001) | Misma señal, mismo resultado que VIBE-001 | Igual que arriba — 0 blocking calls reales |
| VIBE-006 (`@KafkaListener`) | `@KafkaListener` | 0 ocurrencias | Sin dependencia `spring-kafka` en ningún módulo — usa RabbitMQ |
| VIBE-007 (MDC leak) | `MDC.` + `@Async`/`@Scheduled` | `@Scheduled` en 1 archivo (`OrderTimeOutCancelTask.java`, mall-portal), pero **0 uso de `MDC.` en todo el repo** | Sin señal de MDC, el gate compuesto no puede activarse — TRUE_NEGATIVE trivial |

**Conclusión repo 07: 0 findings, TRUE_NEGATIVE confirmado.** A diferencia de repo 06 (sin señal de entrada en absoluto), aquí SÍ hay señales parciales en 2 reglas (VIBE-001/005 y, débilmente, VIBE-007), pero en ambos casos la verificación adicional confirma que no hay patrón de riesgo real que perder.

### Nota estructural — `@Transactional` declarado solo en la interfaz, nunca en el `*Impl.java` (candidato a investigación futura, NO confirmado por reproducción)

Los 18 archivos `.java` (no-test) con `@Transactional` son **interfaces de servicio** (`PmsBrandService.java`, `OmsPortalOrderService.java`, etc.) — la anotación está sobre la declaración abstracta del método (sin cuerpo, termina en `;`), nunca en la implementación real (`PmsBrandServiceImpl.java`, etc.), donde vive el cuerpo del método. Verificado 1:1 — ninguna de las 18 clases `*Impl.java` correspondientes tiene `@Transactional` en su propio texto. Es un patrón Spring válido y común (los proxies JDK basados en interfaz sí respetan la anotación en tiempo de ejecución), pero **estructuralmente invisible para las 7 reglas**, que operan línea a línea dentro de un único archivo: `TransactionalAsyncRule`/`ConnectionPoolStarvationRule` nunca podrían correlacionar la anotación (archivo interfaz) con el cuerpo del método (archivo impl), aunque hubiera una llamada bloqueante real dentro.

**No se ha confirmado impacto real — a diferencia de METHOD_OPEN, que se elevó a "sistémico" solo tras reproducirse con una consecuencia real en dos reglas distintas.** Aquí no hay ningún caso real: verificado que ninguna de las 18 clases Impl contiene `CompletableFuture`/`Future`/`.join()`/`.block()` (0 en todo el repo — ni las 3 llamadas `.get(0)`/`.get(i)` encontradas de pasada en `OmsCartItemServiceImpl.java`/`UmsMemberServiceImpl.java`/etc. son relevantes: son `List.get(int)`, no `Future.get()`). Es decir, aunque la anotación fuera visible en el archivo correcto, no habría nada que detectar en este repo. **No cumple el criterio de "deténte y repórtalo" (no es más que un caso aislado sin impacto demostrado) — se registra como candidato a investigación futura de prioridad baja/media, a vigilar en próximos repos si el patrón interfaz+impl vuelve a aparecer junto con una llamada bloqueante real.**

**Actualización repo 08 (spring-petclinic):** el mismo patrón (`@Transactional` sobre una declaración de interfaz sin cuerpo, `VetRepository.findAll()`) reaparece en la app de referencia oficial de Spring — segunda recurrencia, pero de nuevo sin ningún cuerpo de método donde pudiera existir una llamada bloqueante (es una interfaz `extends Repository<...>`, sin implementación propia en el código de usuario — Spring Data genera la implementación). Sigue sin cumplir el umbral de "deténte" por la misma razón: cero impacto demostrado. Se registra la recurrencia como refuerzo de que el patrón es común, no como escalada.

**Conteo acumulado (actualizado 2026-09-06, antes de repo 09):**

| # | Repo | Archivo | Impacto demostrado |
|---|---|---|---|
| 1 | Repo 07 (macrozheng/mall) | 18 interfaces `*Service.java` (mall-admin/mall-portal) | Ninguno — 0 blocking calls reales en las 18 `*Impl.java` correspondientes |
| 2 | Repo 08 (spring-petclinic) | `vet/VetRepository.java` | Ninguno — interfaz `extends Repository<...>`, sin implementación de usuario |

**Actualización repo 09 (dyc87112/SpringBoot-Learning):** tercera ocurrencia — `1.x/Chapter3-3-1/.../UserService.java`, interfaz con `@Transactional(isolation=..., propagation=...)` sobre `User login(String name, String password);`, sin cuerpo (mismo patrón exacto). Ver detalle en la sección Repo 09.

**Actualización repo 10 (ityouknow/spring-boot-examples):** cuarta ocurrencia — `spring-boot-jpa/.../UserRepository.java` (duplicado idéntico en raíz y `2.x/`, contado como una sola ocurrencia lógica), interfaz `extends JpaRepository<...>` con `@Transactional` sobre `modifyById(...)`/`deleteById(...)`, sin cuerpo. Ver detalle en la sección Repo 10.

| # | Repo | Archivo | Impacto demostrado |
|---|---|---|---|
| 1 | Repo 07 (macrozheng/mall) | 18 interfaces `*Service.java` (mall-admin/mall-portal) | Ninguno — 0 blocking calls reales en las 18 `*Impl.java` correspondientes |
| 2 | Repo 08 (spring-petclinic) | `vet/VetRepository.java` | Ninguno — interfaz `extends Repository<...>`, sin implementación de usuario |
| 3 | Repo 09 (SpringBoot-Learning) | `Chapter3-3-1/.../UserService.java` | Ninguno — interfaz de servicio sin cuerpo, ningún `*Impl.java` en el mismo módulo del tutorial |
| 4 | Repo 10 (spring-boot-examples) | `spring-boot-jpa/.../UserRepository.java` | Ninguno — interfaz `extends JpaRepository<...>`, sin implementación de usuario (Spring Data genera la implementación) |

**4/10 repos de la ronda presentan el patrón (los últimos 4 consecutivos: repos 07, 08, 09, 10), 0/4 con impacto demostrado.** Se mantiene como candidato de prioridad baja/media, NO escalado a "sistémico" — el umbral sigue siendo evidencia real de una llamada bloqueante perdida dentro del cuerpo correspondiente, no solo la recurrencia del patrón estructural. La racha de 4/4 en los últimos repos de la ronda sugiere que el patrón es común en código Spring real (no solo tutoriales), por lo que conviene seguir vigilándolo en futuras rondas de validación aunque no cumpla el umbral de escalada todavía.

### Nota de alcance — VIBE-003 y la convención de nombres `*Mapper*` de MyBatis (no es un bug, la regla ya hace lo que dice)

El propio código de `JpaNPlusOneRule.java` documenta que `REPO_SINGLE_OP` exige explícitamente que la variable contenga `Repository`/`Repo` ("Spring naming convention") para evitar falsos positivos. MyBatis Generator (usado en todo `mall`) nombra sus DAOs `*Mapper*` (`PmsBrandMapper`, `OmsOrderMapper`, etc.), no `*Repository*`/`*Repo*` — estos objetos quedan fuera del patrón **por diseño explícito de la regla**, no por un descuido. Igual que `SaTokenConfig.java` en repo 06, esto no se registra como candidato nuevo: la regla hace exactamente lo que documenta hacer, y MyBatis con su propia convención de nombres es, legítimamente, una superficie que no prometió cubrir.

---

## Repo 08 — spring-projects/spring-petclinic

- **Commit pineado:** `88e37c15cf6fc8490b01bc3e8e2c800cec1ac272` — **reutilizado del `validation/repos.json` existente** (usado por el pipeline `validate-public` del CLI), no un HEAD nuevo. Verificado antes de usarlo, no asumido ciego: es ancestro directo del HEAD actual del repo (`818c413`, 2026-08-26), solo 2 commits por detrás (2026-07-30 → 2026-08-26). El único de esos 2 commits que toca `.java` (`676db04`) es un fix de validación de longitud de nombre de mascota en `Owner.java`/`PetValidator.java` — sin relación con ninguna de las 7 reglas. Commit confirmado razonable, se mantiene sin actualizar, dejando esta ronda (MCP, manual) y la ronda del CLI (`validate-public`) ancladas al mismo punto exacto del repo para que sean comparables.
- **Path:** `src/main/java/` — app de referencia oficial de Spring (single-module, no monorepo).
- **Engine:** clases compiladas desde `mcp-server` HEAD `621496a`. **Método:** servidor MCP desconectado (mismo incidente que repos 02-07) — `RepoScan.java` (7 reglas) sobre `target/classes`.

### Naturaleza del repo

`spring-petclinic` es la aplicación de referencia canónica de Spring Framework/Boot — un CRUD de clínica veterinaria (dueños, mascotas, veterinarios, visitas). Pequeña (30 archivos `.java` en `src/main`), arquitectura Spring MVC tradicional + Spring Data JPA (`spring-boot-starter-data-jpa` en `pom.xml` — a diferencia de `mall`, aquí sí es JPA real, no MyBatis). Sin WebFlux/reactor, sin Kafka, sin AMQP. Es el codebase más "libro de texto" de los 8 analizados hasta ahora — código deliberadamente simple y bien documentado, sin patrones de producción complejos.

### Resultado del escaneo (7 reglas)

**0 findings** en 30 archivos escaneados.

### Auditoría de TRUE_NEGATIVE (verificación real de las 2 señales parciales encontradas, no solo grep superficial)

| Regla | Señal de entrada | Resultado | Verificación adicional |
|---|---|---|---|
| VIBE-001/005 (`@Transactional` + blocking) | `@Transactional` | 1 archivo: `vet/VetRepository.java` | Verificado línea a línea: la anotación está sobre `findAll()`/`findAll(Pageable)`, declaraciones abstractas de interfaz (`extends Repository<Vet, Integer>`, sin cuerpo — terminan en `throws DataAccessException;`). No hay cuerpo de método en el que pueda existir una llamada bloqueante — mismo patrón "interfaz sin impl" ya registrado en repo 07, ver nota actualizada allí |
| VIBE-002 (`.block()`-family en clase reactiva) | `import reactor.core.publisher.*` | 0 ocurrencias | Sin `webflux`/`reactor` en `pom.xml` |
| VIBE-003 (N+1 JPA) | `@Service`/`@Component` con variable `*Repository*`/`*Repo*` en loop | 1 archivo: `owner/PetTypeFormatter.java` (`@Component`, campo `PetTypeRepository types`) | Verificado: `types.findPetTypes()` se llama **una sola vez, antes del loop** (no dentro) — el `for` posterior solo itera en memoria sobre la colección ya obtenida, sin más llamadas al repositorio. Además el nombre del método (`findPetTypes`) no matchea el patrón `REPO_SINGLE_OP` de la regla (`findBy[A-Z]\w*`/`findAll`/etc. — "findPetTypes" no encaja en ninguno) — doble motivo independiente por el que no dispara, ninguno de los dos por casualidad |
| VIBE-004 (virtual threads) | `Thread.ofVirtual`/`newVirtualThreadPerTaskExecutor`/`synchronized` | 0 ocurrencias | — |
| VIBE-006 (`@KafkaListener`) | `@KafkaListener` | 0 ocurrencias | Sin `spring-kafka` en `pom.xml` |
| VIBE-007 (MDC leak) | `MDC.` + `@Async`/`@Scheduled` | 0 ocurrencias | — |

**Conclusión repo 08: 0 findings, TRUE_NEGATIVE confirmado por verificación real de ambas señales parciales encontradas** (no solo por su ausencia, como en la mayoría de las otras 5 reglas aquí). Ninguna de las dos escaladas a candidato nuevo — la de `@Transactional` refuerza (segunda recurrencia) el candidato de prioridad baja/media ya registrado en repo 07, sin cumplir el umbral de "deténte" (cero impacto demostrado); la de `PetTypeFormatter` es un no-match limpio por diseño de la regla, no una laguna.

---

## Repo 09 — dyc87112/SpringBoot-Learning

- **Commit pineado:** `4212d163da816c6fa5b28d59130318dac2379a73` (2022-02-14, HEAD del repo al clonar el 2026-09-06 — no había commit pineado previo, se fija ahora).
- **Path:** raíz del repo — dos árboles paralelos `1.x/` y `2.x/`.
- **Engine:** clases compiladas desde `mcp-server` HEAD `621496a`. **Método:** servidor MCP desconectado (mismo incidente que repos 02-08) — `RepoScan.java` (7 reglas) sobre `target/classes`.

### Naturaleza del repo — tutorial explícito, NO producción (mismo criterio que eugenp/tutorials en repos 01/05)

Confirmado por el propio `README.md` antes de clasificar nada: *"Spring Boot基础教程"* ("Tutorial básico de Spring Boot") — serie didáctica china, gratuita, publicada capítulo a capítulo desde 2016. Estructura: **103 mini-proyectos Maven independientes** (`chapterN-M/` en 2.x: 53; `ChapterN-M-K/` en 1.x: 50), cada uno ilustrando una única feature de Spring Boot (JPA, transacciones multi-datasource, `@Async`, `@Scheduled`, actuator, etc.) de forma aislada — 298 archivos `.java` no-test en total. El commit pineado (`使用tinylog记录日志` = "usando tinylog para logging") es en sí mismo un commit por-tema, confirmando el patrón incremental. **A diferencia de `ConsumerSimulator.java`/`FileContentSearchService.java` (repo 01), aquí no hizo falta aplicar la cautela contextual de "antipatrón deliberado con fines didácticos" porque el escaneo no produjo ningún finding que clasificar** — pero se declara la naturaleza del repo antes del escaneo, como pide el protocolo, no después.

### Resultado del escaneo (7 reglas)

**0 findings** en 298 archivos escaneados.

### Auditoría de TRUE_NEGATIVE (verificación real de cada señal parcial encontrada — repo grande, no solo grep superficial ni muestreo)

| Regla | Señal de entrada | Resultado | Verificación adicional |
|---|---|---|---|
| VIBE-001/005 (`@Transactional` + blocking) | `@Transactional` | 2 archivos: `chapter3-12/.../TestService.java`, `Chapter3-3-1/.../UserService.java` | `TestService.tx()`/`tx2()` tienen cuerpo real (demo de transacción multi-datasource con `JdbcTemplate`) pero ninguna llamada bloqueante — solo `.update(...)`. `UserService.login(...)` es una declaración de interfaz sin cuerpo — **tercera ocurrencia** del patrón "interfaz sin impl" (ver tabla acumulada arriba) |
| VIBE-002 (`.block()`-family en clase reactiva) | `import reactor.core.publisher.*` | 0 ocurrencias | Ningún `pom.xml` de los 103 capítulos tiene `webflux` — el tutorial (2016-2022) no llega a cubrir WebFlux |
| VIBE-003 (N+1 JPA) | `@Service`/`@Component` con variable `*Repository*`/`*Repo*` en loop | 29 archivos `@Service`/`@Component`, ninguno con loop+llamada-repo co-ocurrentes | Verificado por inspección de código, no solo grep de señal aislada: ninguno de los 29 combina un `for`/`while` con `repo.findBy*/findAll/save/delete` en el mismo archivo. También se revisaron los `CommandLineRunner` (patrón típico de seeding de datos demo en tutoriales) — ninguno usa un loop |
| VIBE-004 (virtual threads) | `Thread.ofVirtual`/`newVirtualThreadPerTaskExecutor`/`synchronized` | 0 ocurrencias | — |
| VIBE-006 (`@KafkaListener`) | `@KafkaListener` | 0 ocurrencias | `Chapter5-2-1` usa `spring-boot-starter-amqp` (RabbitMQ), no Kafka — sin relación con esta regla |
| VIBE-007 (MDC leak) | `MDC.` + `@Async`/`@Scheduled` | 11 archivos con `@Async`/`@Scheduled` (capítulos dedicados a esos temas), **0 uso de `MDC.` en las 298 archivos** | Sin señal de MDC en absoluto, el gate compuesto no puede activarse — TRUE_NEGATIVE trivial pese al alto número de archivos `@Async`/`@Scheduled` |

**Conclusión repo 09: 0 findings, TRUE_NEGATIVE confirmado por verificación real, no por muestreo.** Con 103 mini-proyectos independientes se optó por auditar las señales de entrada sobre el repo completo (mismo criterio de eficiencia que repo 07 con sus 7 módulos) en vez de revisar capítulo por capítulo uno a uno — justificado porque el grep de señales ya cubre el 100% de los archivos, no una muestra, y cada señal positiva encontrada (4 archivos en total: 2 de VIBE-001/005, 29 candidatos de VIBE-003 descartados por inspección, 11 de VIBE-007) fue verificada individualmente, no descartada por conteo. Ningún hallazgo requirió aplicar la cautela contextual de "antipatrón didáctico deliberado" porque no hubo ningún finding que clasificar como TP/FP/CONTEXTUAL/INCIERTO.

---

## Repo 10 — ityouknow/spring-boot-examples

- **Commit pineado:** `53c8c8d6d0b957e9d4ae02f99d5993d5e699d522` (2022-12-29, HEAD del repo al clonar el 2026-09-06 — no había commit pineado previo, se fija ahora).
- **Path:** raíz del repo — colección de ejemplos + árboles paralelos `1.x/`, `2.x/`.
- **Engine:** clases compiladas desde `mcp-server` HEAD `621496a`. **Método:** servidor MCP desconectado (mismo incidente que repos 02-09) — `RepoScan.java` (7 reglas) sobre `target/classes`.

### Naturaleza del repo — tutorial explícito, verificado igual que repo 09 (no asumido por el nombre)

Confirmado por el propio `README.md` antes de clasificar: *"Spring Boot 学习示例"* ("Ejemplos de aprendizaje de Spring Boot") — *"Spring Boot 使用的各种示例... ayudar a los principiantes a dominar rápidamente los componentes de Spring Boot"*. Estructura: 22 ejemplos aislados en la raíz (`spring-boot-jpa`, `spring-boot-webflux`, `spring-boot-mybatis`, etc.) + 21 en `1.x/` + 32 en `2.x/` — muchos duplicados/mirror entre versiones (verificado con `diff`: `UserRepository.java` y `HelloController.java` son **idénticos byte a byte** entre la raíz y su copia en `2.x/`). 432 archivos `.java` no-test en total. Mismo criterio que repo 09: tutorial confirmado, no producción.

### Resultado del escaneo (7 reglas)

**0 findings** en 432 archivos escaneados.

### Auditoría de TRUE_NEGATIVE (verificación real de cada señal — atención especial a VIBE-002 por existir un ejemplo `spring-boot-webflux` dedicado)

| Regla | Señal de entrada | Resultado | Verificación adicional |
|---|---|---|---|
| VIBE-001/005 (`@Transactional` + blocking) | `@Transactional` | 1 archivo lógico (`spring-boot-jpa/.../UserRepository.java`, duplicado idéntico en raíz + `2.x/`) | Interfaz `extends JpaRepository<User, Long>`, `@Transactional` sobre `modifyById(...)`/`deleteById(...)` — declaraciones abstractas de query derivada, sin cuerpo. **Cuarta ocurrencia** del patrón "interfaz sin impl" (ver tabla acumulada en la sección de candidatos) |
| VIBE-002 (`.block()`-family en clase reactiva) | `import reactor.core.publisher.*` | 1 archivo lógico (`spring-boot-webflux/.../HelloController.java`, duplicado idéntico raíz + `2.x/`) | Verificado línea a línea: `@GetMapping public Mono<String> hello() { return Mono.just("..."); }` — reactivo genuino, **cero** llamadas `.block()`/`.blockFirst()`/`.blockLast()` en todo el ejemplo. TRUE_NEGATIVE real, no por ausencia de superficie sino por código efectivamente no bloqueante |
| VIBE-003 (N+1 JPA) | `@Service`/`@Component` con variable `*Repository*`/`*Repo*` en loop | 78 archivos `@Service`/`@Component`, ninguno con loop+llamada-repo co-ocurrentes | Igual método que repo 09: inspección de los 78 candidatos + revisión de `CommandLineRunner` (típico seeder de datos demo) — ninguno usa un loop |
| VIBE-004 (virtual threads) | `Thread.ofVirtual`/`newVirtualThreadPerTaskExecutor`/`synchronized` | 0 ocurrencias | — |
| VIBE-006 (`@KafkaListener`) | `@KafkaListener` | 0 ocurrencias | Sin dependencia `spring-kafka` en ningún ejemplo |
| VIBE-007 (MDC leak) | `MDC.` + `@Async`/`@Scheduled` | `@Scheduled` en `SchedulerTask.java`/`Scheduler2Task.java` (× duplicados en raíz/1.x/2.x), **0 uso de `MDC.` en las 432 archivos** | `SchedulerTask.process()` es `private` (modificador explícito, sin relación con el gap de `METHOD_OPEN`) — solo hace `System.out.println`, sin MDC. TRUE_NEGATIVE trivial |

**Conclusión repo 10: 0 findings, TRUE_NEGATIVE confirmado por verificación real** en las 3 señales parciales encontradas (VIBE-001/005, VIBE-002, VIBE-007) — ninguna requirió la cautela de "antipatrón didáctico deliberado" porque no hubo ningún finding real que clasificar, y el caso VIBE-002 (WebFlux) se verificó con especial atención por instrucción explícita y resultó ser código reactivo genuinamente limpio, no una laguna del detector.

---

## Global Summary

**Ronda de 10 repos completada 2026-09-06.** Engine: `mcp-server` HEAD `621496a` (incluye fix VIBE-006, NO commiteado todavía — ver "Fix aplicado durante validación" abajo).

| # | Repo | Naturaleza | Archivos escaneados | Findings (estado actual) | TP | FP | CONTEXTUAL | INCIERTO |
|---|---|---|---|---|---|---|---|---|
| 01 | eugenp/tutorials (spring-kafka) | Mixto: producción real + demo Baeldung | ~39 (no reconfirmado esta ronda, estimación previa) | 7 (VIBE-006) | 4 | 1 | 0 | 2 |
| 02 | spring-projects/spring-kafka | Librería núcleo + samples/docs declarados | 386 | 23 pre-fix → **0 post-fix** | 0 | 0 (post-fix; 23 pre-fix) | 0 | 0 |
| 03 | spring-cloud/spring-cloud-stream-samples | 100% samples oficiales | 93 | 0 | — | — | — | — |
| 04 | hantsy/spring-reactive-sample | 100% samples oficiales (nombre literal) | 452 | 8 (VIBE-002) | 8 | 0 | 0* | 0 |
| 05 | eugenp/tutorials (spring-reactive-modules) | Mixto: pedagógico + patrón arquitectónico realista | 384 | 8 (VIBE-002) | 8** | 0 | 0** | 0 |
| 06 | macrozheng/mall-swarm (gateway) | Producción real, WebFlux | 7 | 0 | — | — | — | — |
| 07 | macrozheng/mall | Producción real, monolito e-commerce (MyBatis) | 519 | 0 | — | — | — | — |
| 08 | spring-projects/spring-petclinic | App de referencia oficial (JPA) | 30 | 0 | — | — | — | — |
| 09 | dyc87112/SpringBoot-Learning | 100% tutorial explícito | 298 | 0 | — | — | — | — |
| 10 | ityouknow/spring-boot-examples | 100% tutorial explícito | 432 | 0 | — | — | — | — |
| **Total** | | | **~2640** | **23** | **20** | **1** | **0** | **2** |

\* 6/8 findings de repo 04 llevan una nota contextual sobre posible ampliación de exclusiones (`CommandLineRunner`/`ApplicationRunner`/`@EventListener`) — no cambia su clasificación TP.
\*\* 2/8 findings de repo 05 son TP con matiz de alcanzabilidad (código actualmente muerto) — se mantienen como TP, no como bucket separado.

**Nota de discrepancia detectada al compilar esta tabla:** la tabla-resumen original de repo 01 (línea "VIBE-006 | 7 | 5 | 1 | 1") no coincide con su propia tabla de revisión manual línea a línea (4 TP / 1 FP / 2 UNCERTAIN). Se usa aquí el desglose línea a línea como autoritativo. No corregido en la sección de repo 01 — señalado aquí para que no se pierda.

### Bugs reales del motor confirmados y corregidos esta ronda

**2 bugs, ambos en `KafkaRebalanceHazardRule.java` (VIBE-006), commit `621496a`:**
1. `id()` no se trataba como `groupId` efectivo pese a `idIsGroup()` (default `true`).
2. Comentarios de bloque `/* */`/`/** */` no se eliminaban antes del matching.
Ambos descubiertos por un **100% FP (23/23)** contra la librería `spring-projects/spring-kafka` — la propia librería que la regla pretende vigilar. Verificados por re-análisis post-fix (23→0) y por generalización correcta a un repo nuevo (repo 03: `id="batch-out"` tratado correctamente).

### Candidatos a investigación futura acumulados (ver sección dedicada más abajo para detalle completo)

| Candidato | Ocurrencias / evidencia | Estado |
|---|---|---|
| **METHOD_OPEN sistémico** (package-private nunca escaneado) | Confirmado por reproducción directa en 2 reglas (VIBE-006 repo02: 2 archivos; VIBE-002 repo05: `ThreadStarvationApp`, fixture mínimo reproducido) | Diagnóstico de coste/alcance completo (2026-09-06) → **DEJAR PARA BATCH**, no es one-liner seguro |
| **`@Transactional` en interfaz sin cuerpo** (VIBE-001/005 ciego estructuralmente) | **4/10 repos** (07, 08, 09, 10 — racha de 4 consecutivos), 0/4 con impacto demostrado | NO escalado — umbral es impacto real, no recurrencia; vigilar |
| **Comment-stripping incompleto** (solo `//`, nunca `/* */`) en 5 reglas (VIBE-002/003/004/005/007) | Generalizado por grep desde el fix de VIBE-006; NO confirmado por reproducción directa en ningún repo de esta ronda | Candidato abierto, menor urgencia relativa que METHOD_OPEN |
| **VIBE-001 — 3 deudas acumuladas en el mismo archivo** | (a) cero comment-stripping, ni `//` — la más grave de las 7; (b) `METHOD_OPEN` sin grupo de modificadores; (c) sin guards `!inMethod`/`isAbstract` que protegen a las otras 6 | Prioridad #1 declarada para el batch |
| **VIBE-002 — exclusión de startup-initializers incompleta** | Confirmado en repo 04 (8/8 findings) — `CommandLineRunner`/`ApplicationRunner` deberían excluirse (mismo riesgo bajo que `@PostConstruct`); `@EventListener(ContextRefreshedEvent)` NO debería (riesgo real de re-disparo) | Candidato abierto, matizado en dos sub-decisiones independientes |
| VIBE-006 — no lee `application.properties`/`.yml` para `group-id` vía auto-config | Contribuye a los 2 casos INCIERTO de repo 01 | Mencionado, sin sección dedicada propia |

Dos observaciones fueron evaluadas y **correctamente NO escaladas** a candidato (regla ya hace lo que documenta): `SaTokenConfig.java`/RedisTemplate bloqueante en filtro reactivo (repo 06, fuera de la superficie declarada de VIBE-002) y convención de nombres `*Mapper*` de MyBatis fuera del alcance declarado de VIBE-003 (repo 07).

### Conclusión

El proceso de validación **funcionó como debía**: encontró un bug real y grave (100% FP contra la propia librería Kafka de referencia) antes de que se convirtiera en un problema público, lo corrigió, y verificó la corrección tanto por re-análisis como por generalización a un repo nuevo. Eso es una señal positiva del *proceso*, no todavía del *motor completo*.

Pero el motor en sí **no está listo para más validación externa sin trabajo estructural previo**, por tres razones concretas surgidas en esta misma ronda:

1. **5 de las 7 reglas (VIBE-001, 003, 004, 005, 007) no han sido ejercitadas contra ningún caso positivo real en esta ronda de 10 repos.** Cada señal de entrada parcial que apareció resultó ser un TRUE_NEGATIVE genuino (interfaces sin cuerpo, llamadas fuera de loop, MDC ausente) — sabemos que no dan falsas alarmas en estos 10 repos, pero no sabemos si detectarían el antipatrón real si apareciera, más allá de sus fixtures sintéticos de test.
2. **VIBE-001 acumula 3 debilidades de diseño en el mismo archivo** (sin comment-stripping en absoluto, regex más débil, sin guards estructurales) que no han causado un fallo visible solo porque ningún repo de esta ronda tenía las condiciones exactas para dispararlas — no porque estén resueltas.
3. **El gap de METHOD_OPEN ya se demostró real en 2 reglas distintas**, y el patrón `@Transactional`-en-interfaz aparece en el 40% de los repos de esta ronda (con una racha de 4/4 al cierre) — ninguno de los dos ha causado daño todavía, pero ambos son estructurales, no anecdóticos, y "todavía no ha pasado" no es lo mismo que "está arreglado".

**Recomendación: antes de una ronda de validación externa más ambiciosa (tipo issue #19304), priorizar el batch de fixes ya documentado** — empezando por VIBE-001 (sus 3 deudas) y METHOD_OPEN (con las salvaguardas ya diseñadas en el diagnóstico de coste/alcance) — en vez de sumar más repos con el motor en su estado actual.

---

## Candidatos a investigación futura (NO corregidos durante esta validación)

Registrados como evidencia solamente — mismo criterio que issue #11 (blocking.js): documentar, no arreglar a mitad de campaña.

### VIBE-006 / KafkaRebalanceHazardRule.java — dos patrones sistemáticos de FP confirmados (Repo 02)

1. **`id()` no se trata como `groupId` efectivo.** La regla solo busca el literal `groupId\s*=\s*"..."` (línea 58). No comprueba `id()` pese a que `idIsGroup()` (default `true` en el propio `KafkaListener.java` del framework) hace que `id` sea el `group.id` real salvo que se desactive explícitamente. 10/23 findings de repo 02 caen aquí.
2. **Comentarios de bloque `/* */` y `/** */` no se eliminan antes del matching.** `noComment()`/`codeOnly()` (líneas 232-241) solo cortan en `//`. Cualquier mención de `@KafkaListener` dentro de Javadoc (`{@code @KafkaListener}`, `<pre><code>@KafkaListener(...)</code></pre>`) se trata como anotación real. 13/23 findings de repo 02 caen aquí — es la misma clase de bug que issue #9/#11 en blocking.js (comment-stripping incompleto), pero en el motor Java, no descubierta hasta ahora.

Impacto observado: 23/23 (100%) de los findings VIBE-006 en repo 02 fueron FALSE_POSITIVE por estas dos causas combinadas. Pendiente de: (a) decidir si merece su propio issue tipo #11, (b) evaluar si estos dos patrones también contaminan repo 01 (5 TP/1 FP/1 incierto ya cerrado — no se re-abre aquí) u otros repos de la validación en curso.

**[CHECKPOINT 2026-09-05 — fix VIBE-006 aplicado, NO commiteado todavía]**

Los dos bugs de arriba quedan corregidos en `KafkaRebalanceHazardRule.java`:
(a) `id()` ahora se trata como `groupId` efectivo cuando `idIsGroup` no está
explícitamente en `false` (Javadoc de `KafkaListener.idIsGroup()`, default
`true`); `groupId = ""` explícito sigue ganando siempre como CRITICAL, tenga
o no `id`. (b) `noComment()`/`codeOnly()` se reemplazaron por una máquina de
estados carácter-a-carácter (`stripComments()`) que además de `//` elimina
bloques `/* */` y `/** */` (Javadoc), preservando saltos de línea exactos y
sin tocar `line`/`trim` (los que usa `braceDepth`). 5 fixtures de regresión
nuevas + `mvn test` 148/148 (143 base + 5 nuevos), 0 fallos. Re-análisis de
repo 02 en el mismo commit pineado (`3c4bf1b71ff4a5f4df0f1a147f7a430342208074`):
ver resultado añadido más abajo en la sección del Repo 02.

**Hallazgo de alcance ampliado — mismo tratamiento que issue #11 (no corregido ahora):**
`grep -l "codeOnly" mcp-server/src/main/java/com/vibeguard/mcp/rules/*.java`
confirma que las otras 5 reglas del MCP comparten el mismo `codeOnly()`
que solo corta en `//` y nunca maneja `/* */` ni `/** */`:

- `JpaNPlusOneRule.java` (VIBE-003)
- `ConnectionPoolStarvationRule.java` (VIBE-005)
- `MdcContextLeakRule.java` (VIBE-007)
- `ReactorBlockingCallRule.java` (VIBE-002)
- `VirtualThreadsMisuseRule.java` (VIBE-004)

Cualquiera de ellas puede sobre-marcar un patrón mencionado dentro de un
comentario de bloque o Javadoc, igual que ocurría en VIBE-006 (10/23 FP de
repo 02 eran exactamente esto). **Candidato a investigación futura** — no se
toca ninguna de las 5 en este fix, que se limita a VIBE-006 por alcance
explícito de la tarea.

### ⚠️ Sistémico en las 7 reglas — métodos package-private nunca escaneados (VIBE-006 en repo 02, CONFIRMADO también en VIBE-002 en repo 05)

**Actualizado 2026-09-06 — elevado de "hallazgo de VIBE-006" a hallazgo sistémico**, tras confirmarlo por reproducción directa en una segunda regla:

`grep -n "METHOD_OPEN\s*=" mcp-server/src/main/java/com/vibeguard/mcp/rules/*.java` confirma que **las 7 reglas** (no solo VIBE-006) definen su propio `METHOD_OPEN` con la misma exigencia: `(?:public|protected|private)` explícito al inicio de la firma. Un método sin modificador (package-private, el default de Java) nunca activa `inMethod` en ninguna de las 7, así que su cuerpo nunca se escanea — sea cual sea el patrón de riesgo dentro.

Evidencia:
- **VIBE-006** (repo 02): `samples/sample-05/.../Sample05Application.java:39`, `samples/sample-08/.../Sample08Application.java:43` — métodos `@KafkaListener` package-private, sin `id=`/`groupId=`, nunca escaneados.
- **VIBE-002** (repo 05, confirmado por reproducción con fixture mínimo, no solo lectura del regex): `spring-webflux-2/.../threadstarvation/ThreadStarvationApp.java:47-52`, método `warning()` — package-private, con `.block()` real y **el propio autor del tutorial ya lo marcó con `@SuppressWarnings("BlockingMethodInNonBlockingContext")`** (el nombre exacto de la inspección de IntelliJ para este anti-patrón) — es decir, el caso está deliberadamente señalado como "aquí está el bug" y aun así el detector lo pasa por alto. Ver detalle en la sección Repo 05.

No estaban en los findings originales de sus respectivos repos por este mismo motivo, no por casualidad. **Candidato a investigación futura de máxima prioridad relativa entre los ya registrados — es el único que hemos confirmado por reproducción directa en dos reglas distintas, y afecta a las 7. NO corregido ahora.**

**[CHECKPOINT 2026-09-06 — diagnóstico de coste/alcance completado, sin implementar]**

Antes de continuar con repo 06 se evaluó exclusivamente el coste y alcance de este gap (sin tocar código, reglas ni fixtures). Resultado completo:

**1. Definición actual de `METHOD_OPEN`**

6 de 7 reglas (`VirtualThreadsMisuseRule`, `ReactorBlockingCallRule`, `ConnectionPoolStarvationRule`, `MdcContextLeakRule`, `JpaNPlusOneRule`, `KafkaRebalanceHazardRule`) comparten literalmente:
```java
(?:public|protected|private)
(?:\s+(?:static|final|synchronized|abstract|native))*
\s+\S+\s+\w+\s*\(
```
`TransactionalAsyncRule.java` (VIBE-001) usa una versión simplificada, sin el grupo de modificadores opcionales:
```java
(?:public|protected|private)\s+\S+\s+\w+\s*\(
```
(falla en `public static void foo(` — inconsistencia ya registrada por separado, ver más abajo).

**2. Qué cubre y qué queda fuera**

Cubre: modificador explícito + (opcional, solo en 6/7) `static|final|synchronized|abstract|native` + un token de tipo de retorno sin espacios (`\S+`) + un token de nombre (`\w+`) + `(`.

Queda fuera, en las 7 reglas por igual:
- **Package-private** (el gap central de esta sección).
- Tipos de retorno con espacios internos (`Map<String, Foo> build()` no matchea).
- Métodos `default`/estáticos de interfaz sin `public` explícito (implícitamente públicos) — mismo síntoma de fondo.
- **Constructores** — nunca matchean, con o sin modificador; no hay token de tipo-retorno separado del nombre.
- **Métodos genéricos** (`public <T> T identity(T t)`) — hay 3 tokens antes del nombre, el patrón solo admite 2.
- **Firmas multilínea** — el matching es línea a línea (`code = codeOnly(lines.get(i).strip())`); si modificador/tipo y `nombre(` caen en líneas distintas, no matchea en ninguna.

**3. Tabla de riesgos — ampliación ingenua (quitar la exigencia de modificador)**

Verificado empíricamente con un probe de regex desechable (Python, fuera del repo, sin tocar código):

| Caso | Regex actual | Ampliación ingenua | Riesgo |
|---|---|---|---|
| Método package-private real (`Mono<String> warning() {`) | No matchea | Matchea | Ninguno — es el fix buscado |
| Inicializador de campo con llamada (`private int cache = computeDefault();`) | No matchea | **Matchea** (falso positivo) | Contenido — protegido en 6/7 reglas por el guard `isAbstract` (línea termina en `;` sin `{`); **no protegido en VIBE-001**, que no tiene ese guard |
| Lambda con bloque (`static final Runnable T = () -> { critical.block(); };`) | No matchea | **Matchea** (falso positivo) | Real y no mitigado — la línea contiene `{`, así que el guard `isAbstract` NO lo detiene en ninguna de las 7; puede fijar `inMethod=true` y generar un finding CRITICAL espurio sobre esa misma línea |
| Constructor público (`public Foo(int x) {`) | No matchea | No matchea | Ninguno — gap preexistente, no se toca con este fix |
| Método genérico público (`public <T> T identity(T t) {`) | No matchea | No matchea | Ninguno — gap preexistente, no se toca con este fix |
| Firma multilínea (`public void` / `foo() {` en líneas separadas) | No matchea | No matchea | Ninguno — requiere rediseño aparte (unir líneas), fuera de alcance de un cambio de regex |

**4. Diferencia estructural VIBE-001 vs. las otras 6**

6/7 reglas comparten la misma estructura de guard:
```java
if (... && !inMethod && METHOD_OPEN.matcher(code).find()) {
    boolean isAbstract = !code.contains("{") && code.endsWith(";");
    if (!isAbstract) { inMethod = true; ... }
}
```
`TransactionalAsyncRule` (VIBE-001) es estructuralmente distinta:
```java
if (inTransactional && METHOD_OPEN.matcher(trimmed).find()) {
    methodStartDepth = braceDepth;
}
```
Carece de **ambas** protecciones que blindan a las otras 6:
- Sin guard `!inMethod` — se re-evalúa en cada línea mientras `inTransactional` sea `true`, no solo al entrar en un método nuevo.
- Sin guard `isAbstract` — nada impide que una línea sin `{` (p. ej. un inicializador de campo con llamada) reasigne `methodStartDepth` incorrectamente.

Ampliar `METHOD_OPEN` de forma idéntica en las 7 reglas **no tendría el mismo efecto semántico**: en las 6 homogéneas, el riesgo de inicializadores de campo queda contenido por `isAbstract`; en VIBE-001, no.

**5. Cinco regresiones mínimas necesarias para un futuro batch**

1. Método package-private real (positivo — debe empezar a detectarse).
2. Campo/constante con inicializador de llamada a método sin lambda (negativo — no debe activar `inMethod`).
3. Campo con lambda inline que abre `{` (negativo — el caso de riesgo no mitigado identificado en la tabla).
4. Método público ya existente (regresión de base — no debe dejar de detectarse).
5. El mismo caso 2, específico de VIBE-001, para confirmar que no rompe el tracking de `methodStartDepth` al no tener guard `isAbstract`.

**6. Caso `ThreadStarvationApp.java` como evidencia reproducida**

El fixture no existe en disco en esta sesión (confirmado por búsqueda exhaustiva; el repo 05 ya no está clonado localmente). Se reprodujo la firma exacta documentada arriba (`spring-webflux-2/.../threadstarvation/ThreadStarvationApp.java:47-52`, método `warning()`) contra el regex actual y la ampliación ingenua: `Mono<String> warning() {` → actual no matchea, ampliación ingenua sí. **Esto confirma que la ampliación resolvería este falso negativo concreto — pero la misma ampliación introduce los riesgos de la tabla del punto 3 (en particular el de lambda-con-bloque, no mitigado), por lo que el impacto positivo sobre este caso no basta por sí solo para justificar un fix inmediato sin las salvaguardas del punto 4/5.**

**7. Veredicto explícito: DEJAR PARA BATCH**

**Motivo:** no es un cambio homogéneo ni un one-liner seguro. Requiere excluir palabras clave de sentencia (`return|throw|new|if|for|while|...`) delante del pseudo-tipo — el anclaje a inicio de línea por sí solo no basta, porque sentencias como `return calculate(x);` también empiezan la línea — y diseñar salvaguardas estructurales equivalentes al guard `isAbstract`, especialmente para VIBE-001, que hoy no tiene ninguna.

**8. Deuda acumulada en VIBE-001 (`TransactionalAsyncRule.java`)**

Registrado aquí para que quede consolidado en un solo lugar — VIBE-001 acumula **tres** deudas relacionadas, todas ya documentadas por separado en esta sección pero nunca antes agrupadas:
- Ausencia total de comment-stripping (ni siquiera `//` — ver subsección más abajo, "sin ningún comment-stripping").
- `METHOD_OPEN` más simple que las otras 6 (sin el grupo de modificadores `static|final|synchronized|abstract|native`).
- Ausencia de los guards estructurales equivalentes (`!inMethod`, `isAbstract`) que protegen a las otras 6 frente a los riesgos de una futura ampliación de `METHOD_OPEN`.

Las tres deudas son independientes entre sí pero convergen en el mismo archivo, lo que lo convierte en el candidato de mayor prioridad relativa dentro del batch de fixes pendiente — no solo para el comment-stripping (ya señalado como prioridad #1 más abajo), sino también para cualquier trabajo futuro sobre `METHOD_OPEN`.

### VIBE-002 / ReactorBlockingCallRule.java — lista de exclusión no cubre startup-initializer idioms reactivos (detectado en repo 04)

Excluye `@Test`/`@PostConstruct`/`main()` con la razón "runs once at startup, blocking is acceptable", pero `CommandLineRunner`/`ApplicationRunner`/`@EventListener(ContextRefreshedEvent.class)` — los idioms equivalentes en apps reactivas modernas — no están cubiertos. 8/8 findings de repo 04 son este patrón exacto (ver sección Repo 04). No es un bug del detector (la atribución es mecánicamente correcta, verificado línea a línea) — es una posible laguna de diseño en la lista de exclusiones. **Candidato a investigación futura — NO corregido, no cambia la clasificación TRUE_POSITIVE de los 8 findings.**

> **Precisión importante — la prioridad NO es uniforme entre los 3 idioms agrupados arriba (aclarado 2026-09-06, a petición explícita):**
> - **`CommandLineRunner`/`ApplicationRunner` (4/8 findings: #5-8 de repo 04):** Spring Boot garantiza ejecución única, después del refresh del contexto y antes de que `SpringApplication.run()` retorne — la misma garantía "corre una vez al arranque" que ya justifica excluir `@PostConstruct`. Es un patrón igual de razonable en producción real (migraciones de datos al arranque, cache warm-up, espera a un servicio dependiente), no solo en demos. **Aquí SÍ sube la prioridad de ampliar la exclusión** — el riesgo de ocultar un caso real de producción es bajo, porque la garantía de single-fire es la misma que ya se acepta para `@PostConstruct`.
> - **`@EventListener(ContextRefreshedEvent.class)` (4/8 findings: #1-4 de repo 04):** al contrario — `ContextRefreshedEvent` **no** está garantizado a dispararse una sola vez (contextos padre/hijo, Spring Cloud Config, reinicios de DevTools pueden republicarlo). Un bloqueo aquí SÍ podría re-ejecutarse inesperadamente en producción. **Aquí la prioridad de excluirlo debería ser BAJA, no alta** — suprimirlo por defecto arriesga ocultar exactamente el caso de producción que preocupa (bloqueo repetido en cada refresh, no solo al primer arranque).
>
> Conclusión: si se implementa esta ampliación de exclusiones en el batch de fixes, debe tratarse como dos decisiones independientes, no una sola regla — `CommandLineRunner`/`ApplicationRunner` son candidatos fuertes; `@EventListener(ContextRefreshedEvent.class)` no debería añadirse a la lista de exclusión sin un análisis aparte.

### VIBE-001 / TransactionalAsyncRule.java — sin ningún comment-stripping (detectado en repo 03)

> **⚠️ MAYOR SEVERIDAD RELATIVA — priorizar primero en el batch de fixes.** A diferencia del gap de las otras 5 reglas (que sí tienen al menos protección de `//`, y solo les falta `/* */`/`/** */`), esta regla no tiene NINGUNA protección — ni `//`. Es el caso más expuesto de los 7 detectores: cualquier `@Transactional`/`.get()`/`.join()`/`.block()` mencionado en un comentario de una sola línea (`// avoid .block() here`) ya la dispara, sin necesidad siquiera de un bloque Javadoc. Cuando se decida el batch de fixes al cierre de la ronda de 10 repos, este debería ir primero.

`grep -L "codeOnly\|stripComments" mcp-server/src/main/java/com/vibeguard/mcp/rules/*.java` confirma que `TransactionalAsyncRule.java` es la única de las 7 reglas que no elimina comentarios en absoluto — ni siquiera `//` de línea (a diferencia de las otras 6, que al menos tienen `codeOnly()`/`stripComments()`). `TRANSACTIONAL_ANNOTATION.matcher(trimmed)` y `BLOCKING_CALL.matcher(trimmed)` (líneas 55 y 73) operan sobre la línea cruda sin sanear. No se manifestó como finding en repo 03 (ningún `@Transactional`/`.get()`/`.block()` cae ahí dentro de un comentario o string en ese repo), pero es un caso más severo que el de las otras 5 reglas — falta también el `//`, no solo el bloque `/* */`. **Candidato a investigación futura, mismo tratamiento — NO corregido.**

---

## Fix aplicado durante validación

**Commit:** `c8b1fc4` — `fix: exclude test code from analysis`  
**Causa raíz:** `VibeGuardEngine.collectJavaFiles()` no excluía directorios `/test/` ni archivos `*Test.java`, `*IT.java`, etc.  
**Impacto observado:** 189/212 hallazgos en spring-projects/spring-kafka eran de test code.  
**Corrección:** Añadidos 5 filtros adicionales en `collectJavaFiles()` — ver `VibeGuardEngine.java`.
