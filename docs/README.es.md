# Modo de planificación para Pi

> 🌐 Disponible en: [English](../README.md) | [Français](README.fr.md) | [Português](README.pt.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md).

Extensión TypeScript que añade planificación conversacional a Pi-agent v1 or later: investigar el proyecto, aclarar decisiones, proponer mejoras útiles y presentar un plan antes de implementar. Paquete `pi-plan-claude-codex`, versión `0.1.2`.

El workflow toma como referencia la [planificación de Codex](https://developers.openai.com/blog/run-long-horizon-tasks-with-codex) y la [revisión y aprobación de planes de Claude Code](https://code.claude.com/docs/en/permission-modes#review-and-approve-a-plan). La implementación está orientada a las APIs públicas de extensiones de Pi-agent v1 or later. Pi **1.0.4** es la referencia comprobada; esto no certifica todas las versiones anteriores o futuras.

## Instalar y usar

Instala el paquete una vez:

```sh
pi install npm:pi-plan-claude-codex
```

Después entra a Pi como siempre, desde cualquier proyecto:

```sh
pi
```

Dentro de la conversación, activa el modo:

```text
/plan
```

En la TUI de macOS/Linux, el atajo fijo **Ctrl+Q** también activa o desactiva el modo, igual que `/plan` sin argumentos. Conserva el borrador del editor y la propuesta actual, no envía peticiones al modelo y **nunca aprueba ni ejecuta un plan**. Al desactivar, restaura las herramientas anteriores. Durante un turno activo solo muestra una advertencia: no interrumpe el trabajo ni programa un cambio posterior.

Ctrl+Q usa Control, no Command, y no requiere configurar Option/Meta en macOS. Los diálogos nativos de Pi conservan el foco del teclado; no es un atajo global. Si el terminal, el sistema operativo u otro atajo intercepta la combinación, usa `/plan` como alternativa. En Windows/WSL, Pi reserva Ctrl+Q para poner mensajes de seguimiento en cola y omite el atajo de la extensión; usa `/plan` allí.

Ahora describe tu objetivo como un mensaje normal, por ejemplo: «Quiero agregar búsqueda al catálogo; investiga cómo funciona y propón mejoras antes de decidir».

La instalación registra el paquete en la configuración personal de Pi. En los siguientes arranques se carga automáticamente y `/plan` queda disponible. El modo se activa con ese comando o con el atajo de teclado; el usuario no necesita pasar rutas ni flags al arrancar. También admite `/plan <petición>` como atajo.

Para instalar el repositorio local, incluso antes de la primera publicación en npm, ejecuta:

```sh
pi install /ruta/absoluta/pi-plan-claude-codex
```

Después usa el mismo flujo `pi` → `/plan`.

Requiere Pi-agent v1 or later y Node.js `>=22.19.0`. Pi carga el TypeScript sin compilarlo previamente y proporciona las dependencias declaradas en `peerDependencies`.

## Workflow

1. **Investigar.** Lee las instrucciones del proyecto y el código relevante antes de preguntar por hechos descubribles. Utiliza solo herramientas disponibles y permitidas; detente cuando haya evidencia suficiente para la siguiente decisión e indica qué falta por verificar.
2. **Conversar.** Aclara las incógnitas importantes sobre objetivo, alcance, restricciones y criterios de éxito. Ofrece mejoras materiales con sus consecuencias y pregunta si deben incluirse, sin inventar sugerencias para cumplir una cuota ni reabrir propuestas rechazadas sin nueva evidencia.
3. **Cerrar decisiones.** Resuelve interfaces, enfoque, errores, compatibilidad y validación. Conserva las decisiones aceptadas e indica los supuestos menores sin convertirlos en bloqueos. Normalmente pregunta una decisión importante, hasta tres relacionadas; sin número mínimo de rondas ni preguntas de relleno.
4. **Revisar y esperar.** Cuando no queden decisiones importantes pendientes, presenta un plan Markdown completo con decisiones aceptadas, pasos verificables, pruebas y supuestos. Una petición suficientemente definida puede ir directamente a revisión. En TUI/RPC, espera la elección del usuario sin repetir el plan completo en el chat.

Las preguntas permiten opciones con consecuencias y recomendación, además de respuesta libre. Cancelarlas deja la decisión sin responder y detiene el turno. El modelo recibe instrucciones para conservar las decisiones previas y no ampliar el alcance sin aceptación. La calidad de la entrevista y la completitud del plan dependen también del modelo elegido.

Al presentar el plan aparecen estas acciones:

- **Seguir planificando:** conserva la propuesta pendiente y las restricciones de lectura.
- **Refinar el plan:** pide comentarios y genera una nueva revisión.
- **Ejecutar en esta conversación:** restaura las herramientas anteriores e inicia la implementación con el plan aprobado.
- **Ejecutar en una sesión limpia:** crea una sesión sin el historial de la entrevista y entrega el plan completo, su procedencia, el modelo, el nivel de razonamiento y las herramientas anteriores.

Cancelar la revisión mantiene el modo activo. Una aprobación solo vale para esa propuesta y esa sesión. Nueva información invalida la propuesta anterior; una respuesta tardía a un diálogo ya invalidado no puede iniciar la ejecución. Si se cancela la creación de una sesión limpia, se vuelve a la planificación.

No hay límite de rondas de refinamiento. Puedes continuar con mensajes normales o con la acción de refinar; cada revisión completa debe pasar otra vez por `plan_submit` y por la revisión. La aprobación normal no requiere desactivar `/plan`. En TUI y RPC, si el modelo termina un turno sin una propuesta vigente, la extensión solicita una continuación de recuperación: preguntar las decisiones pendientes con `plan_ask` o presentar el plan completo actualizado con `plan_submit`. No hay recuperación tras una pregunta sin responder o cancelada, una revisión cerrada, una exportación fallida, un turno abortado o un error. Si el modelo sigue ignorando el flujo, un aviso mantiene la planificación activa e invita a enviar otro mensaje normal, sin bucles automáticos ni aprobaciones implícitas.

## Comandos

| Comando | Resultado |
| --- | --- |
| `/plan` | Activa o desactiva el modo. |
| Ctrl+Q (macOS/Linux) | Alterna igual que `/plan`, en la TUI. |
| `/plan <petición>` | Activa el modo y empieza a planificar esa petición. |
| `/plan on` | Activa sin enviar una petición al modelo. |
| `/plan off` | Desactiva y restaura las herramientas previas. |
| `/plan status` | Muestra modo, revisión, estado y archivo Markdown. |
| `/plan review` | Vuelve a mostrar la propuesta y el selector; reintenta una exportación fallida. |
| `/plan execute` | Abre el mismo selector de revisión; requiere elegir una acción. |
| `/plan refine [comentarios]` | Refina la propuesta con comentarios o abre una pregunta para escribirlos. |
| `--plan` | Inicia en modo planificación si la rama no tiene un estado guardado. |

Los cambios de modo se realizan con el agente en reposo. Escribir «implementa el plan» como un mensaje ordinario mantiene la planificación: la transición se hace mediante los comandos o la selección explícita de ejecución. Desactivar con `/plan off` termina las restricciones del modo, sin iniciar automáticamente una implementación.

## Exploración permitida

Mientras está activo, se habilitan `read`, `grep`, `find`, `ls` y tres herramientas propias:

| Herramienta | Función |
| --- | --- |
| `plan_ask` | Preguntas con opciones o respuesta libre. |
| `plan_submit` | Guarda y presenta una propuesta; no aprueba su ejecución. |
| `plan_inspect` | Consultas Git fijas: `status`, `diff`, `log` y `show`. |

Las herramientas externas previamente activas pueden seguir disponibles si declaran `readOnlyHint: true` y no declaran `destructiveHint: true`. Se bloquean las herramientas desconocidas o mutantes, incluidas las llamadas anidadas, además de `bash`, `powershell`, `codemode`, `write`, `edit` y los comandos del usuario `!`/`!!`.

`plan_inspect` usa argumentos directos, sin shell, con operaciones fijas, referencias validadas, opciones que deshabilitan diferencias externas y textconv, límite de diez segundos y salida acotada. Los tests, builds, scripts e instalaciones deben esperar a la ejecución aprobada. Si falta evidencia que requiere esas operaciones, el plan debe reconocerlo.

Esto es una política dentro de Pi, no una sandbox del sistema operativo. Las anotaciones de herramientas externas son declaraciones de sus autores; otras extensiones ejecutan código con los permisos de Pi. Las escrituras propias del modo se limitan a snapshots de sesión y exportaciones de propuestas.

## Estado y archivos

El estado y la última propuesta se guardan como entradas personalizadas en la **rama actual de la sesión**. Se restauran al reanudar, recargar, cambiar de sesión o navegar el árbol. Una rama nueva solo hereda los snapshots presentes en sus antecesores.

Cada propuesta crea un archivo independiente `.pi/plans/<uuid>.md` en el proyecto, sin sobrescribir revisiones anteriores. La sesión es la fuente de verdad; editar el Markdown exportado no modifica ni aprueba automáticamente la propuesta. Usa `/plan refine` para incorporar cambios. `.pi/plans/` está excluido de Git en este repositorio.

Si falla la exportación, la propuesta permanece en la sesión, no se abre el selector de ejecución y `/plan review` permite reintentar. Los directorios `.pi` y `plans` no pueden ser enlaces simbólicos. Los archivos se crean de forma exclusiva con permisos `0600` en sistemas que los soportan. `--no-session` conserva estado solo durante el proceso, mientras los archivos Markdown siguen en disco.

## TUI, RPC, print y JSON

En TUI se usan los diálogos nativos y un indicador del modo. Se comprobaron `regular` y `fullscreen`, Unicode y resize a terminal estrecha.

En RPC se usan las peticiones `extension_ui_request` nativas (`select` e `input`), widgets de texto y notificaciones. El cliente debe mostrar la propuesta y contestar los diálogos con `extension_ui_response`, o cancelarlos. El comando RPC `abort` espera a que la sesión quede inactiva; cancela una revisión abierta después del turno con `extension_ui_response`, sin esperar a que `abort` la cierre. No se infieren respuestas ni aprobaciones por timeout. La implementación comienza después de que se cierre el turno de planificación.

Print/text y JSON mantienen las restricciones, sin diálogos ni ejecución automática. Las preguntas pendientes se presentan en la respuesta final; si el plan está completo, se exporta y el modelo debe incluir su Markdown en la respuesta final. JSON/RPC mantienen stdout reservado al protocolo.

```sh
pi --plan -p 'Planifica una búsqueda en el catálogo'
pi --plan --mode json -p 'Planifica una búsqueda en el catálogo'
pi --mode rpc
```

## Desarrollo y verificación

Para probar el checkout sin publicarlo, instala su ruta con `pi install /ruta/absoluta/pi-plan-claude-codex`; después usa `pi` y `/plan` igual que con el paquete de npm. Para cargarlo solo durante una invocación de desarrollo, usa `pi -e /ruta/absoluta/pi-plan-claude-codex`.

```sh
npm run check
npm test
npm pack --dry-run --ignore-scripts
```

El checker reutiliza las dependencias de la instalación de Pi. Las pruebas de distribución empaquetan esta extensión, sirven el tarball desde un registro npm local y ejecutan `pi install npm:pi-plan-claude-codex` en un perfil temporal. Después arrancan `pi` sin argumentos y prueban tanto `/plan` como Ctrl+Q en una PTY. Estas pruebas automatizadas verifican el paquete instalado, no una pulsación física en una aplicación de terminal concreta. No modifican la configuración personal del usuario ni descargan dependencias de terceros.

`check` necesita `tsc` en PATH. Puedes especificar `PI_PLAN_HOST_ROOT` (raíz del paquete de Pi) y `PI_PLAN_TSC` (ejecutable del checker). Las pruebas de integración lanzan `pi` desde PATH; utiliza la misma instalación para los tipos y los procesos. La validación local pasó con Pi `1.0.4`, TypeScript `5.9.3`, Node `24.18.0` y Python `3.14.7` en macOS. Los tests usan la eliminación nativa de tipos de Node. Las pruebas de terminal Unix necesitan Python 3; se omiten en Windows.

La suite comprueba instalación y carga automática, política de herramientas, snapshots de ramas, exportaciones, errores y cancelación, aprobación en ambas sesiones, conservación de modelo/razonamiento, invalidación de diálogos, refinamiento, reload, aislamiento del historial, llamadas anidadas, modos sin UI y terminal real. Utiliza el runtime instalado de Pi con un proveedor determinista sin llamadas a modelos ni credenciales reales. Las fixtures no se incluyen en el paquete distribuible.

Estas pruebas verifican los mecanismos, los contratos del prompt y el protocolo, incluidas las instrucciones de planificación que recibe el proveedor y su retirada tras la aprobación. No constituyen una evaluación conversacional con un modelo real, una prueba de que cualquier modelo hará menos preguntas ni una validación de clientes RPC específicos. Los resultados locales no sustituyen una ejecución de GitHub Actions en Ubuntu con Python 3.12.

### Integración continua

GitHub Actions ejecuta `npm run check`, toda la suite de `npm test` y `npm pack --dry-run --ignore-scripts` en pull requests, pushes a `main` y ejecuciones manuales. El job usa Ubuntu 24.04, Node `24.x` y Python `3.12`, e incluye ambos modos de terminal y las pruebas de instalación del paquete.

Pi `1.0.4`, sus paquetes internos y TypeScript `5.9.3` se instalan desde un [proyecto privado de herramientas de CI](../.github/ci/README.md) separado, con un lockfile versionado. El workflow usa allí `npm ci --ignore-scripts`, sin instalar el paquete raíz, por lo que las `peerDependencies` del host se mantienen intactas. La instalación de dependencias requiere acceso al registro npm; las pruebas utilizan fixtures deterministas offline y un registro local de pruebas. La validación no utiliza credenciales de modelos.

### Entrega continua

`.github/workflows/cd.yml` publica en npm mediante OIDC solo cuando `CI` termina correctamente para un push a `main` de este repositorio. Utiliza el SHA exacto validado por CI, serializa las publicaciones sin cancelar una release en curso y omite las versiones ya publicadas. Los errores del registro hacen fallar el job, en lugar de interpretarse como una versión ausente. No publican las PRs, los forks, las ejecuciones manuales de CI ni los CI fallidos.

En npm hay que configurar el Trusted Publisher con usuario `santgabo`, repositorio `pi-plan-claude-codex`, archivo de workflow **`cd.yml`**, environment vacío y publicación directa con `npm publish` habilitada. No se guarda un token de publicación en GitHub. Las versiones se incrementan deliberadamente, no en cada push. Consulta la [guía de releases](RELEASING.md) y el [changelog](CHANGELOG.md), ambos en inglés, para configurar, validar y comprobar las publicaciones.
