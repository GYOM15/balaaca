<#import "template.ftl" as layout>
<@layout.emailLayout title="Confirmez votre adresse" lead="Un clic et votre espace Balaaca est actif.">
  <h1 style="margin:0;font-size:22px;font-weight:800;letter-spacing:-.02em;line-height:1.25;color:#17201E;">
    Confirmez votre adresse
  </h1>
  <p style="margin:12px 0 0;font-size:15px;line-height:1.6;color:#505653;">
    Vous venez de créer un espace professionnel sur Balaaca. Un clic et il est
    à vous&nbsp;: vous pourrez publier votre page, vos prestations et vos horaires,
    et recevoir des rendez-vous.
  </p>

  <@layout.button href=link label="Confirmer mon adresse" />

  <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#666C69;">
    Ce lien est valable ${linkExpirationFormatter(linkExpiration)}.
  </p>

  <@layout.fallback href=link />
</@layout.emailLayout>
