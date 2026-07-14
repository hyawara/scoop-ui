!macro customInit
  ; Direct reference to instFilesPre to prevent NSIS warning 6010 (function not referenced).
  ; Keep it unreachable: instFilesPre must run only before the install-files page.
  Goto +2
  Call instFilesPre
!macroend

!macro customInstallMode
  ; Updates are launched with --updated. Keep the existing install scope and skip the
  ; install-mode page only when the previous installation scope is unambiguous.
  ${if} ${isUpdated}
    ${if} $hasPerMachineInstallation == "1"
    ${andIf} $hasPerUserInstallation == "0"
      StrCpy $isForceMachineInstall "1"
    ${elseIf} $hasPerMachineInstallation == "0"
    ${andIf} $hasPerUserInstallation == "1"
      StrCpy $isForceCurrentInstall "1"
    ${endif}
  ${endif}
!macroend
