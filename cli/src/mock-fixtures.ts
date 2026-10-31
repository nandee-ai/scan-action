/** Sample findings for `nandee scan --mock`.  No real project data. */
export const sourceFindings = [
  {
    id: 1, issue_title: "Hard-coded API key in BuildConfig", issue_detail: "A key is compiled into the app and can be read from the APK.",
    severity: "Critical", status: "Open", file_path: "app/src/main/java/com/example/Config.kt", line_number: "12",
    code_snippet: 'const val API_KEY = "example"', suggestion: "Fetch the key at runtime from a secured endpoint.", cwe: "CWE-798",
    owasp_category: "M1: Improper Credential Usage", masvs: ["MASVS-STORAGE-1"], validator_verdict: "exploitable",
  },
  {
    id: 2, issue_title: "Cleartext traffic permitted", issue_detail: "usesCleartextTraffic is true.", severity: "Medium", status: "Open",
    file_path: "app/src/main/AndroidManifest.xml", line_number: "8", code_snippet: null, suggestion: null, cwe: "CWE-319",
    owasp_category: "M5: Insecure Communication", masvs: ["MASVS-NETWORK-1"], validator_verdict: "unknown",
  },
  {
    id: 3, issue_title: "Debug logging of request bodies", issue_detail: "Log.d prints request bodies.", severity: "Low", status: "Open",
    file_path: "app/src/main/java/com/example/Net.kt", line_number: "40", code_snippet: null, suggestion: null, cwe: "CWE-532",
    owasp_category: null, masvs: [], validator_verdict: "false_positive",
  },
];
