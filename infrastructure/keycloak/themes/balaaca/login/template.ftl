<#--
  The shell every sign-in screen is drawn in.

  It replaces base's template rather than extending it, because base's is a
  PatternFly page and this one is the product's: the mark, one card, and a
  legal line. The macro keeps base's exact signature and the same `nested`
  section names, so every screen this theme does not override still renders.
-->
<#macro registrationLayout displayInfo=false displayMessage=true displayRequiredFields=false showTitle=true showAnotherWayIfPresent=true>
<!DOCTYPE html>
<html lang="${locale.currentLanguageTag!'fr'}"<#if realm.internationalizationEnabled> dir="${(locale.rtl)?then('rtl','ltr')}"</#if>>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="robots" content="noindex, nofollow">
  <meta name="theme-color" content="#123C35">
  <title><#if showTitle><#nested "title"><#else>${msg("loginTitle",(realm.displayName!''))}</#if></title>
  <link rel="icon" href="${url.resourcesPath}/img/logo.png">
  <#-- Clash Display and DM Sans, served by this theme itself and never by a
       CDN: a sign-in screen that waits on a third party is a sign-in screen
       that goes blank when the third party is slow. Declared in balaaca.css
       beside the tokens they belong to. -->
  <#if properties.styles?has_content>
    <#list properties.styles?split(' ') as style>
      <link href="${url.resourcesPath}/${style}" rel="stylesheet">
    </#list>
  </#if>
</head>

<body class="${properties.kcBodyClass!}">
  <main class="${properties.kcLoginClass!}">

    <#-- The mark links home. A provider who lands here by accident, or who
         finished and wants out, has one way back that is not the back button.

         The address comes from the client's own baseUrl, which init-realm.sh
         sets from FRONTEND_ORIGIN on every boot. It cannot be relative and it
         cannot be a constant: Keycloak serves this page from its own origin,
         so a relative href lands on Keycloak, and a constant would send a
         developer to production. -->
    <#assign appUrl = (client.baseUrl)!''>
    <a class="bal__brand" href="${appUrl}/">
      <img class="bal__mark" src="${url.resourcesPath}/img/logo.png" alt="" width="38" height="38">
      <span class="bal__word">Bala<em>a</em>ca</span>
    </a>

    <div class="${properties.kcFormCardClass!}">

      <#-- Keycloak's own message, dressed. `error` interrupts a screen reader
           and the other three do not: a page that shouts every time it says
           something is a page nobody reads. -->
      <#if displayMessage && message?has_content && (message.type != 'warning' || !isAppInitiatedAction??)>
        <div class="bal__note bal__note--${message.type}"
             role="<#if message.type = 'error'>alert<#else>status</#if>">
          <span>${kcSanitize(message.summary)?no_esc}</span>
        </div>
      </#if>

      <#if showTitle>
        <h1 class="bal__title"><#nested "header"></h1>
      </#if>
      <#nested "lead">

      <#nested "form">

      <#if displayInfo>
        <div class="bal__foot"><#nested "info"></div>
      </#if>

      <#nested "socialProviders">

      <#if auth?has_content && auth.showTryAnotherWayLink() && showAnotherWayIfPresent>
        <form class="bal__form" action="${url.loginAction}" method="post">
          <input type="hidden" name="tryAnotherWay" value="on">
          <button class="bal__btn bal__btn--quiet" type="submit">${msg("doTryAnotherWay")}</button>
        </form>
      </#if>
    </div>

    <#-- The two pages the footer of the product links to. Written here as
         absolute addresses because Keycloak serves this page from its own
         origin and knows nothing of the application's routes. -->
    <p class="bal__legal">
      En continuant, vous acceptez les
      <a href="${appUrl}/conditions">conditions</a>
      et la
      <a href="${appUrl}/confidentialite">politique de confidentialité</a>.
    </p>

    <#if realm.internationalizationEnabled && locale.supported?size gt 1>
      <ul class="bal__locales">
        <#list locale.supported as l>
          <li><a href="${l.url}">${l.label}</a></li>
        </#list>
      </ul>
    </#if>
  </main>
</body>
</html>
</#macro>
