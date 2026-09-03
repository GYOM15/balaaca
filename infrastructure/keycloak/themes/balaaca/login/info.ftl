<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=false; section>
  <#if section = "title">
    Balaaca
  <#elseif section = "header">
    <#if messageHeader??>${kcSanitize(msg("${messageHeader}"))?no_esc}<#else>${msg("infoTitle")}</#if>
  <#elseif section = "form">
    <div class="bal__note bal__note--${(message.type)!'info'}" role="status">
      <span>${kcSanitize(message.summary)?no_esc}
        <#if requiredActions??><#list requiredActions>: <#items as ra>${kcSanitize(msg("requiredAction.${ra}"))?no_esc}<#sep>, </#items></#list></#if>
      </span>
    </div>
    <#if skipLink??>
    <#elseif pageRedirectUri?has_content>
      <a class="bal__btn" href="${pageRedirectUri}">${msg("backToApplication")}</a>
    <#elseif actionUri?has_content>
      <a class="bal__btn" href="${actionUri}">${msg("proceedWithAction")}</a>
    <#elseif client.baseUrl?has_content>
      <a class="bal__btn" href="${client.baseUrl}">${msg("backToApplication")}</a>
    </#if>
  </#if>
</@layout.registrationLayout>
