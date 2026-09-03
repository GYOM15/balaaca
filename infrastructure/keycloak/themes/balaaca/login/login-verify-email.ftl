<#import "template.ftl" as layout>
<@layout.registrationLayout displayInfo=true; section>
  <#if section = "title">
    Confirmez votre adresse · Balaaca
  <#elseif section = "header">
    Confirmez votre adresse
  <#elseif section = "lead">
    <#-- The address is named. A reader who mistyped it finds out here rather
         than after ten minutes of watching an inbox that will never fill. -->
    <p class="bal__lead">${msg("emailVerifyInstruction1",user.email!'')}</p>
  <#elseif section = "form">
    <div class="bal__note bal__note--info" role="status">
      <span>Le lien est valable une journée. Vérifiez vos indésirables&nbsp;: un
        premier message arrive souvent là.</span>
    </div>
  <#elseif section = "info">
    ${msg("emailVerifyInstruction2")}
    <a class="bal__link" href="${url.loginAction}">${msg("doClickHere")}</a>
  </#if>
</@layout.registrationLayout>
