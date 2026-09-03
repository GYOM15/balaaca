<#--
  The shell every message is drawn in.

  Tables and inline styles, and that is not carelessness: Gmail strips a <style>
  block on a forwarded message, Outlook renders a <div> layout at the wrong
  width, and no mail client has ever supported a custom property. So the
  colours are written as hex, each one named for the design token it came from,
  and a test in the frontend fails the build if a token stops resolving to the
  value written here. A palette copied by hand is a palette that drifts.
-->
<#macro emailLayout title lead>
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${title}</title>
</head>
<#-- --bg -->
<body style="margin:0;padding:0;background:#FAF8F2;">
  <#-- Read by the inbox list before the message is opened, and by nothing else. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${lead}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background:#FAF8F2;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="max-width:520px;">

          <#-- The mark. Deep green on ivory, as the header of the product. -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <#-- --brand on --text: the tile of the design system, drawn in a
                   table cell because a border-radius on an <img> is dropped by
                   half the clients that matter. -->
              <span style="font-family:'Manrope',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:20px;font-weight:800;letter-spacing:-.03em;color:#17201E;">
                Bala<span style="color:#7E6023;">a</span>ca
              </span>
            </td>
          </tr>

          <#-- --surface, --border, --r-md -->
          <tr>
            <td style="background:#FFFFFF;border:1px solid #E4E0D4;border-radius:12px;padding:32px 28px;font-family:'Manrope',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <#nested>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding-top:20px;font-family:'Manrope',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#666C69;">
              <#-- --text-tertiary. Why they got it, so a message nobody asked
                   for is recognisable as one. -->
              Vous recevez ce message parce qu&rsquo;une inscription a été faite
              avec cette adresse sur Balaaca.<br>
              Si ce n&rsquo;était pas vous, ignorez-le&nbsp;: rien n&rsquo;a été activé.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
</#macro>

<#-- A button that survives Outlook, which ignores padding on an <a>. -->
<#macro button href label>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
  <tr>
    <#-- --brand / --text-on-dark -->
    <td align="center" bgcolor="#123C35" style="border-radius:8px;">
      <a href="${href}" style="display:inline-block;padding:14px 28px;font-family:'Manrope',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:8px;">${label}</a>
    </td>
  </tr>
</table>
</#macro>

<#-- The same address as plain text. A link that does not open is a dead end,
     and on a mid-range Android it happens often enough to plan for. -->
<#macro fallback href>
<p style="margin:0;font-size:13px;line-height:1.6;color:#666C69;">
  Le bouton ne fonctionne pas&nbsp;? Copiez cette adresse dans votre navigateur&nbsp;:
</p>
<p style="margin:6px 0 0;font-size:13px;line-height:1.6;word-break:break-all;">
  <a href="${href}" style="color:#123C35;">${href}</a>
</p>
</#macro>
