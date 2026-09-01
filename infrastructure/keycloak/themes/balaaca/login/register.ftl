<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=!messagesPerField.exists('global') displayRequiredFields=false; section>
  <#if section = "title">
    Créer votre espace · Balaaca
  <#elseif section = "header">
    Créer votre espace
  <#elseif section = "lead">
    <#-- Said here rather than after the fact: the next screen asks for a
         confirmation e-mail, and a reader who was not told expects the diary. -->
    <p class="bal__lead">Une adresse et un mot de passe. Nous vous enverrons un
      message pour confirmer l&rsquo;adresse, puis vous choisirez votre métier et
      votre nom d&rsquo;établissement.</p>
  <#elseif section = "form">
    <form class="${properties.kcFormClass!}" action="${url.registrationAction}" method="post">
      <#list profile.attributes as attribute>
        <#-- Turning internationalisation on adds `locale` to the user profile,
             and a loop that trusts the profile renders it as a text box asking
             a provider to type a language tag. Anything the profile marks
             hidden, and that one by name, goes through as a hidden input so the
             value still posts. -->
        <#if attribute.name = 'locale'
             || (attribute.annotations.inputType!'') = 'hidden'>
          <input type="hidden" name="${attribute.name}" value="${(attribute.value!'')}">
        <#else>
        <div class="${properties.kcFormGroupClass!}">
          <label class="${properties.kcLabelClass!}" for="${attribute.name}">
            ${advancedMsg(attribute.displayName!'')}<#if attribute.required> *</#if>
          </label>
          <input class="${properties.kcInputClass!}" id="${attribute.name}" name="${attribute.name}"
                 type="<#if attribute.name = 'email'>email<#else>text</#if>"
                 <#if attribute.name = 'email'>inputmode="email" autocomplete="email"</#if>
                 value="${(attribute.value!'')}"
                 <#if attribute.required>required</#if>
                 aria-invalid="<#if messagesPerField.existsError('${attribute.name}')>true</#if>">
          <#if messagesPerField.existsError('${attribute.name}')>
            <span class="${properties.kcInputErrorMessageClass!}" role="alert">
              ${kcSanitize(messagesPerField.get('${attribute.name}'))?no_esc}
            </span>
          </#if>
        </div>
        </#if>
      </#list>

      <#if passwordRequired??>
        <div class="${properties.kcFormGroupClass!}">
          <label class="${properties.kcLabelClass!}" for="password">${msg("password")} *</label>
          <input class="${properties.kcInputClass!}" id="password" name="password"
                 type="password" autocomplete="new-password" required
                 aria-invalid="<#if messagesPerField.existsError('password','password-confirm')>true</#if>">
          <#if messagesPerField.existsError('password')>
            <span class="${properties.kcInputErrorMessageClass!}" role="alert">
              ${kcSanitize(messagesPerField.get('password'))?no_esc}
            </span>
          </#if>
        </div>
        <div class="${properties.kcFormGroupClass!}">
          <label class="${properties.kcLabelClass!}" for="password-confirm">${msg("passwordConfirm")} *</label>
          <input class="${properties.kcInputClass!}" id="password-confirm" name="password-confirm"
                 type="password" autocomplete="new-password" required
                 aria-invalid="<#if messagesPerField.existsError('password-confirm')>true</#if>">
          <#if messagesPerField.existsError('password-confirm')>
            <span class="${properties.kcInputErrorMessageClass!}" role="alert">
              ${kcSanitize(messagesPerField.get('password-confirm'))?no_esc}
            </span>
          </#if>
        </div>
      </#if>

      <#if recaptchaRequired??>
        <div class="g-recaptcha" data-size="compact" data-sitekey="${recaptchaSiteKey}"></div>
      </#if>

      <button class="${properties.kcButtonClass!}" type="submit">${msg("doRegister")}</button>
    </form>
  <#elseif section = "info">
    Vous avez déjà un espace ?
    <a class="bal__link" href="${url.loginUrl}">${msg("doLogIn")}</a>
  </#if>
</@layout.registrationLayout>
