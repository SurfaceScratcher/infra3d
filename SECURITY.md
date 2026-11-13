# Security

Please report vulnerabilities privately through GitHub:
**Security → Report a vulnerability** in this repository. Do not open a public issue.

infra3d renders data it is given and does not make network requests itself.
The importer reads local files only and never copies environment values into the topology.
Reports about either of these guarantees breaking are especially welcome.
