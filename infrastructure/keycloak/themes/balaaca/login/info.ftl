<#import "template.ftl" as layout>
<#--
  Every "we have something to tell you" screen Keycloak has, plus one that
  deserves better than the others.

  Confirming an e-mail address is the single moment between signing up and
  having an account that does anything, and it used to read "Information" over
  a sentence saying the address was confirmed and nothing else. Somebody who
  had just proved they own a mailbox was told only that, then offered a button
  back to where they came from.

  So that ONE message gets a welcome and the step that is left. The others are
  unchanged: a page-expired notice and a required-action notice are not
  occasions to say hello.

  How the case is recognised: by comparing the summary with the same message
  key that produced it. Not against a literal - the copy would then live in two
  files and the branch would stop matching the first time the sentence was
  edited, silently, leaving the generic page behind.
-->
<@layout.registrationLayout displayMessage=false; section>
  <#assign welcome = message?has_content && message.summary == msg("emailVerifiedMessage")>

  <#if section = "title">
    Balaaca
  <#elseif section = "header">
    <#if welcome>
      ${msg("balaacaWelcomeTitle")}
    <#elseif messageHeader??>
      ${kcSanitize(msg("${messageHeader}"))?no_esc}
    <#else>
      ${msg("infoTitle")}
    </#if>
  <#elseif section = "form">
    <div class="bal__note bal__note--<#if welcome>success<#else>${(message.type)!'info'}</#if>" role="status">
      <span>${kcSanitize(message.summary)?no_esc}
        <#if requiredActions??><#list requiredActions>: <#items as ra>${kcSanitize(msg("requiredAction.${ra}"))?no_esc}<#sep>, </#items></#list></#if>
      </span>
    </div>

    <#-- What is left, named. Both cases in one sentence, because Keycloak
         cannot tell an owner from an invited colleague: the screen that can is
         the dashboard, and it already draws the two doors. -->
    <#if welcome>
      <p class="bal__lead">${msg("balaacaWelcomeLead")}</p>
    </#if>

    <#assign onward = welcome?then(msg("balaacaContinue"), msg("backToApplication"))>
    <#if skipLink??>
    <#elseif pageRedirectUri?has_content>
      <a class="bal__btn" href="${pageRedirectUri}">${onward}</a>
    <#elseif actionUri?has_content>
      <a class="bal__btn" href="${actionUri}">${msg("proceedWithAction")}</a>
    <#elseif client.baseUrl?has_content>
      <a class="bal__btn" href="${client.baseUrl}">${onward}</a>
    </#if>
  </#if>
</@layout.registrationLayout>
