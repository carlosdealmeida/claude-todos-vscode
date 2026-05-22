# Política de Seguridad

[Português](SECURITY.md) · [English](SECURITY.en.md) · **Español**

## Versiones soportadas

Las correcciones de seguridad se aplican solo a la última versión publicada en el Marketplace.

| Versión | Soporte |
|---|---|
| 0.2.x | ✅ |
| < 0.2 | ❌ |

## Cómo reportar una vulnerabilidad

**No abras una issue pública** para fallos de seguridad.

Usa el reporte privado de vulnerabilidades de GitHub:

1. Ve a la pestaña **Security** del repositorio.
2. Haz clic en **Report a vulnerability**.
3. Describe el fallo, su impacto y, si es posible, los pasos para reproducirlo.

Enlace directo: <https://github.com/carlosdealmeida/claude-todos-vscode/security/advisories/new>

## Qué esperar

- **Confirmación de recepción:** en un plazo de 5 días hábiles.
- **Evaluación inicial:** en un plazo de 10 días hábiles, con una estimación de corrección.
- Se te mantiene informado del progreso hasta la resolución.
- Tras la corrección, publicamos un GitHub Security Advisory acreditando a quien reportó (salvo solicitud de anonimato).

## Alcance

Esta extensión es totalmente local y nunca se comunica con ningún servidor. Se consideran dentro del alcance, entre otros:

- Ejecución de código arbitrario a partir de datos leídos de los transcripts de Claude Code.
- Path traversal o escritura fuera de los directorios esperados.
- Exposición de datos sensibles (secretos, contenido de transcripts) más allá de lo necesario.

Fuera de alcance: vulnerabilidades en dependencias de desarrollo que no se incluyen en el `.vsix` publicado.
