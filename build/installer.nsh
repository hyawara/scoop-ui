!macro customInit
  ; Direct reference to instFilesPre to prevent NSIS warning 6010 (function not referenced)
  ; The function is actually invoked by MUI_PAGE_CUSTOMFUNCTION_PRE at runtime,
  ; but the CI makensis binary requires a compile-time Call reference to suppress the warning.
  Call instFilesPre
!macroend
