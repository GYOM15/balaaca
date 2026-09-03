<#import "template.ftl" as layout>
<@layout.registrationLayout displayInfo=true displayMessage=!messagesPerField.existsError('username'); section>
  <#if section = "title">
    Mot de passe oublié · Balaaca
  <#elseif section = "header">
    ${msg("emailForgotTitle")}
  <#elseif section = "lead">
    <p class="bal__lead">${msg("emailInstruction")}</p>
  <#elseif section = "form">
    <form class="${properties.kcFormClass!}" action="${url.loginAction}" method="post">
      <div class="${properties.kcFormGroupClass!}">
        <label class="${properties.kcLabelClass!}" for="username">${msg("email")}</label>
        <input class="${properties.kcInputClass!}" id="username" name="username"
               type="email" inputmode="email" autocomplete="username" autofocus
               value="${(auth.attemptedUsername!'')}"
               aria-invalid="<#if messagesPerField.existsError('username')>true</#if>">
        <#if messagesPerField.existsError('username')>
          <span class="${properties.kcInputErrorMessageClass!}" role="alert">
            ${kcSanitize(messagesPerField.get('username'))?no_esc}
          </span>
        </#if>
      </div>
      <button class="${properties.kcButtonClass!}" type="submit">${msg("doSubmit")}</button>
    </form>
  <#elseif section = "info">
    <a class="bal__link" href="${url.loginUrl}">${msg("backToLogin")}</a>
  </#if>
</@layout.registrationLayout>
