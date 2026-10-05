# 07 · Confirmar una operación delicada

**Plantilla de Supabase:** *Reauthentication*
**Se dispara cuando:** Supabase pide volver a verificar a alguien antes de una
operación sensible (por ejemplo, cambiar la contraseña desde una sesión vieja).

> **Hoy la aplicación no usa este camino**: la contraseña se cambia con el código
> de acceso ordinario, que es la plantilla 02. Se documenta porque la pestaña
> existe en el panel, viene con el texto de fábrica en inglés y, el día que
> alguien active «Secure password change» en Supabase, llegaría así.

Lleva solo `{{ .Token }}`: esta plantilla **no tiene enlace** (Supabase no
entrega un `TokenHash` aquí), así que el botón de las demás se quitó.

## Asunto

```
Tu código de confirmación de Seregenera
```

## Cuerpo

```html
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Confirma que eres tú</title>
</head>
<body style="margin:0; padding:0; background-color:#f0ebe2;">

  <div style="display:none; max-height:0; overflow:hidden; opacity:0; mso-hide:all;">
    Tu código de confirmación: {{ .Token }} — vence en una hora.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f0ebe2;">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="width:100%; max-width:560px; background-color:#ffffff; border-radius:16px; overflow:hidden;">

          <!-- Franja de marca -->
          <tr>
            <td style="height:4px; line-height:4px; font-size:0; background-color:#1b5b3d;">&nbsp;</td>
          </tr>

          <!-- Logo -->
          <tr>
            <td align="center" style="padding:28px 24px 8px 24px;">
              <img src="{{ .SiteURL }}/img/marca/redes/firma-correo.png"
                   width="160" height="40" alt="Seregenera"
                   style="display:block; border:0; outline:none; text-decoration:none; width:160px; height:40px; font-family:Georgia,'Times New Roman',serif; font-size:22px; font-weight:bold; color:#1b5b3d;">
            </td>
          </tr>

          <!-- Contenido -->
          <tr>
            <td style="padding:12px 32px 8px 32px;">
              <h1 style="margin:0; font-family:Georgia,'Times New Roman',serif; font-size:26px; line-height:1.25; font-weight:normal; color:#17241d;">
                Confirma que eres tú
              </h1>
              <p style="margin:14px 0 0 0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:16px; line-height:1.6; color:#55655c;">
                Vas a hacer un cambio delicado en tu cuenta de Seregenera. Para
                protegerla, escribe este código en la pantalla que dejaste abierta:
              </p>
            </td>
          </tr>

          <!-- Código -->
          <tr>
            <td align="center" style="padding:20px 32px 4px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center" style="background-color:#eef7f1; border-radius:12px; padding:22px 12px;">
                    <div style="font-family:Georgia,'Times New Roman',serif; font-size:34px; line-height:1.1; font-weight:bold; letter-spacing:10px; color:#1b5b3d;">
                      {{ .Token }}
                    </div>
                    <div style="margin-top:10px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:13px; color:#55655c;">
                      Vence en una hora y sirve una sola vez
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Nota de seguridad -->
          <tr>
            <td style="padding:28px 32px 0 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="height:1px; line-height:1px; font-size:0; background-color:#e3ded3;">&nbsp;</td></tr>
              </table>
              <p style="margin:20px 0 0 0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:13px; line-height:1.6; color:#55655c;">
                Si no fuiste tú quien pidió esto, no hagas nada: sin el código
                no se cambia nada, y el código vence solo. Si te preocupa, cambia tu contraseña. Nadie de Seregenera te lo va
                a pedir por teléfono, por WhatsApp ni por correo.
              </p>
            </td>
          </tr>

          <!-- Pie -->
          <tr>
            <td align="center" style="padding:26px 32px 30px 32px;">
              <p style="margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:12px; line-height:1.6; color:#55655c;">
                <strong style="color:#1b5b3d;">Seregenera</strong><br>
                Marketplace regenerativo para el turismo
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>
```

## Qué mirar si algo sale mal

| Síntoma | Causa casi segura |
|---|---|
| Llega el texto de fábrica en inglés | No se pegó esta plantilla: es la única pestaña que nadie había tocado |
| No llega el número | Falta `{{ .Token }}` |
| No llega ningún correo | No hay SMTP propio configurado: las plantillas están bloqueadas |
