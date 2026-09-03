<#import "template.ftl" as layout>
<@layout.emailLayout title="Choisir un nouveau mot de passe" lead="Un lien pour reprendre la main sur votre espace.">
  <h1 style="margin:0;font-size:22px;font-weight:800;letter-spacing:-.02em;line-height:1.25;color:#17201E;">
    Choisir un nouveau mot de passe
  </h1>
  <p style="margin:12px 0 0;font-size:15px;line-height:1.6;color:#505653;">
    Quelqu&rsquo;un a demandé à réinitialiser le mot de passe de votre espace
    Balaaca. Si c&rsquo;était vous, choisissez-en un nouveau ci-dessous.
  </p>

  <@layout.button href=link label="Choisir un mot de passe" />

  <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#666C69;">
    Ce lien est valable ${linkExpirationFormatter(linkExpiration)}.
    Tant que vous ne l&rsquo;utilisez pas, votre mot de passe actuel reste valable.
  </p>

  <@layout.fallback href=link />
</@layout.emailLayout>
