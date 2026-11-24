# Parallax #123: repair and replay (2026-11-24T02:55:27.510Z)

Result: **PASS**

- Diagnosis of the branch variables: {"present":true,"readable":false,"identicalToStagingKey":false,"hasLeadingOrTrailingWhitespace":false,"hasEmbeddedWhitespaceOrQuote":true,"length":141,"expectedLength":219,"looksLikeJwt":false,"urlIsStaging":true,"urlHasWhitespace":false}
- Write with the CURRENT branch key: status=0 code= message=TypeError: Cannot convert argument to a ByteString because the character at index 140 has a value of 8230 which is greater than 255.
- Preview codex/parallax-coexistence: 14 chunks, project ids in the bundle: hhearpympdflxyfmszap
- PASS anonymous: /api/admin/modules refused (401)
- PASS public /api/modules: booleans only
- PASS non-admin: GET 403 and PATCH 403
- PASS admin: GET 200 with the five modules
- PASS Shorts disabled -> 404 even for a signed-in admin (guard before any job)
- PASS admin: PATCH saves (app_settings exists and is writable)
- PASS the public flag reflects it after a reload
- PASS admin: PATCH back to disabled
- PASS the public flag is back to false
- PASS persistence: PATCH 200; admin GET after reload shows it; the row exists in app_settings
- PASS non-admin PATCH refused (403) and the stored value is unchanged
- cleanup ok: test module flag emptied
- cleanup ok: rows and files of the disposable accounts
- cleanup ok: account 35eaf37f deleted
- cleanup ok: account c0052148 deleted
- cleanup ok: temporary protection bypass revoked
- cleanup ok: admin e-mail list restored (disposable e-mail removed)
- cleanup ok: #123 rebuilt without the disposable e-mail (the repaired key stays)
- bypass secrets left: 0
- cleanup ok: bypass secrets left on the project
- cleanup ok: disposable accounts absent
