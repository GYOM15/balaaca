<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('password','password-confirm'); section>
  <#if section = "title">
    Nouveau mot de passe · Balaaca
  <#elseif section = "header">
    ${msg("updatePasswordTitle")}
  <#elseif section = "form">
    <form class="${properties.kcFormClass!}" action="${url.loginAction}" method="post">
      <input type="text" id="username" name="username" value="${username!''}"
             autocomplete="username" readonly style="display:none">
      <div class="${properties.kcFormGroupClass!}">
        <label class="${properties.kcLabelClass!}" for="password-new">${msg("passwordNew")}</label>
        <input class="${properties.kcInputClass!}" id="password-new" name="password-new"
               type="password" autocomplete="new-password" autofocus
               aria-invalid="<#if messagesPerField.existsError('password','password-confirm')>true</#if>">
        <#if messagesPerField.existsError('password')>
          <span class="${properties.kcInputErrorMessageClass!}" role="alert">
            ${kcSanitize(messagesPerField.get('password'))?no_esc}
          </span>
        </#if>
      </div>
      <div class="${properties.kcFormGroupClass!}">
        <label class="${properties.kcLabelClass!}" for="password-confirm">${msg("passwordConfirmNew")}</label>
        <input class="${properties.kcInputClass!}" id="password-confirm" name="password-confirm"
               type="password" autocomplete="new-password"
               aria-invalid="<#if messagesPerField.existsError('password-confirm')>true</#if>">
        <#if messagesPerField.existsError('password-confirm')>
          <span class="${properties.kcInputErrorMessageClass!}" role="alert">
            ${kcSanitize(messagesPerField.get('password-confirm'))?no_esc}
          </span>
        </#if>
      </div>
      <#if isAppInitiatedAction??>
        <button class="${properties.kcButtonClass!}" type="submit">${msg("doSubmit")}</button>
        <button class="${properties.kcButtonClass!} bal__btn--quiet" type="submit"
                name="cancel-aia" value="true">${msg("doCancel")}</button>
      <#else>
        <button class="${properties.kcButtonClass!}" type="submit">${msg("doSubmit")}</button>
      </#if>
    </form>
  </#if>
</@layout.registrationLayout>
