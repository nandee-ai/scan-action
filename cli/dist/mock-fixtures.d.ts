/** Sample findings for `nandee scan --mock`.  No real project data. */
export declare const sourceFindings: ({
    id: number;
    issue_title: string;
    issue_detail: string;
    severity: string;
    status: string;
    file_path: string;
    line_number: string;
    code_snippet: string;
    suggestion: string;
    cwe: string;
    owasp_category: string;
    masvs: string[];
    validator_verdict: string;
} | {
    id: number;
    issue_title: string;
    issue_detail: string;
    severity: string;
    status: string;
    file_path: string;
    line_number: string;
    code_snippet: null;
    suggestion: null;
    cwe: string;
    owasp_category: string;
    masvs: string[];
    validator_verdict: string;
} | {
    id: number;
    issue_title: string;
    issue_detail: string;
    severity: string;
    status: string;
    file_path: string;
    line_number: string;
    code_snippet: null;
    suggestion: null;
    cwe: string;
    owasp_category: null;
    masvs: never[];
    validator_verdict: string;
})[];
