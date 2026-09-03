<#import "template.ftl" as layout>
<@layout.emailLayout title="Une action est attendue" lead="Votre espace Balaaca attend une action de votre part.">
  <h1 style="margin:0;font-size:22px;font-weight:800;letter-spacing:-.02em;line-height:1.25;color:#17201E;">
    Une action est attendue
  </h1>
  <p style="margin:12px 0 0;font-size:15px;line-height:1.6;color:#505653;">
    Votre espace Balaaca a besoin que vous fassiez ceci&nbsp;:
    <#list requiredActions><#items as ra>${msg("requiredAction.${ra}")}<#sep>, </#items></#list>.
  </p>

  <@layout.button href=link label="Continuer" />

  <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#666C69;">
    Ce lien est valable ${linkExpirationFormatter(linkExpiration)}.
  </p>

  <@layout.fallback href=link />
</@layout.emailLayout>
