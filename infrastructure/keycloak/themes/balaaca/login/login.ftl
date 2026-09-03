<#import "template.ftl" as layout>
<#-- displayInfo carries the only link to registration. Left at its default
     of false, the sign-in screen is a door with no way to knock. -->
<@layout.registrationLayout
    displayInfo=realm.password && realm.registrationAllowed && !registrationDisabled??
    displayMessage=!messagesPerField.existsError('username','password'); section>
  <#if section = "title">
    Connexion · Balaaca
  <#elseif section = "header">
    Votre espace professionnel
  <#elseif section = "lead">
    <p class="bal__lead">Votre agenda, vos prestations et vos clients. Le même
      compte qu&rsquo;à l&rsquo;inscription.</p>
  <#elseif section = "form">
    <#if realm.password>
      <form class="${properties.kcFormClass!}" action="${url.loginAction}" method="post"
            onsubmit="login.disabled = true; return true;">
        <div class="${properties.kcFormGroupClass!}">
          <label class="${properties.kcLabelClass!}" for="username">${msg("usernameOrEmail")}</label>
          <#-- The realm registers by e-mail, so the field is an e-mail field and
               says so to the keyboard: a telephone offers @ instead of a comma. -->
          <input class="${properties.kcInputClass!}" id="username" name="username"
                 type="email" inputmode="email" autocomplete="username"
                 value="${(login.username!'')}" autofocus
                 aria-invalid="<#if messagesPerField.existsError('username','password')>true</#if>">
          <#if messagesPerField.existsError('username','password')>
            <span class="${properties.kcInputErrorMessageClass!}" role="alert">
              ${kcSanitize(messagesPerField.getFirstError('username','password'))?no_esc}
            </span>
          </#if>
        </div>

        <div class="${properties.kcFormGroupClass!}">
          <label class="${properties.kcLabelClass!}" for="password">${msg("password")}</label>
          <input class="${properties.kcInputClass!}" id="password" name="password"
                 type="password" autocomplete="current-password"
                 aria-invalid="<#if messagesPerField.existsError('username','password')>true</#if>">
        </div>

        <#if realm.rememberMe && !usernameHidden??>
          <label class="${properties.kcCheckboxLabelClass!}" for="rememberMe">
            <input id="rememberMe" name="rememberMe" type="checkbox"
                   <#if login.rememberMe??>checked</#if>>
            <span>${msg("rememberMe")}</span>
          </label>
        </#if>

        <input type="hidden" id="id-hidden-input" name="credentialId"
               <#if auth.selectedCredential?has_content>value="${auth.selectedCredential}"</#if>>
        <button class="${properties.kcButtonClass!}" name="login" id="kc-login" type="submit">
          ${msg("doLogIn")}
        </button>

        <#if realm.resetPasswordAllowed>
          <p style="text-align:center;margin:0">
            <a class="bal__link" href="${url.loginResetCredentialsUrl}">${msg("doForgotPassword")}</a>
          </p>
        </#if>
      </form>
    </#if>
  <#elseif section = "info">
    <#if realm.password && realm.registrationAllowed && !registrationDisabled??>
      ${msg("noAccount")}
      <a class="bal__link" href="${url.registrationUrl}">${msg("doRegister")}</a>
    </#if>
  </#if>
</@layout.registrationLayout>
