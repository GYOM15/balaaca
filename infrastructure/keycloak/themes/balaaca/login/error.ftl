<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=false; section>
  <#if section = "title">
    ${msg("errorTitle")} · Balaaca
  <#elseif section = "header">
    ${msg("errorTitle")}
  <#elseif section = "form">
    <div class="bal__note bal__note--error" role="alert">
      <span>${kcSanitize(message.summary)?no_esc}</span>
    </div>
    <#if skipLink??>
    <#elseif client?? && client.baseUrl?has_content>
      <a class="bal__btn" href="${client.baseUrl}">${msg("backToApplication")}</a>
    </#if>
  </#if>
</@layout.registrationLayout>
