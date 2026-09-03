<#import "template.ftl" as layout>
<@layout.registrationLayout; section>
  <#if section = "title">
    ${msg("pageExpiredTitle")} · Balaaca
  <#elseif section = "header">
    ${msg("pageExpiredTitle")}
  <#elseif section = "lead">
    <#-- Two ways out and not one: a reader who left a tab open for an hour
         wants to carry on, and one who came back tomorrow wants to start over. -->
    <p class="bal__lead">Vous êtes resté un moment sur cette page. Pour votre
      sécurité, il faut recommencer.</p>
  <#elseif section = "form">
    <div class="${properties.kcFormClass!}">
      <a class="bal__btn" href="${url.loginRestartFlowUrl}">Recommencer la connexion</a>
      <a class="bal__btn bal__btn--quiet" href="${url.loginAction}">Reprendre où j&rsquo;en étais</a>
    </div>
  </#if>
</@layout.registrationLayout>
