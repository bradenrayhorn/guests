You are in a VM behind an HTTPS proxy. Network access is possible, as long as the program reads the appropriate variables from the environment: HTTPS_PROXY, HTTP_PROXY, SSL_CERT_FILE, NIX_SSL_CERT_FILE, CURL_CA_BUNDLE, GIT_SSH_CAINFO, REQUESTS_CA_BUNDLE, NODE_EXTRA_CA_CERTS, JAVA_TOOL_OPTIONS, GRADLE_OPTS.
Most programs should already work. If a program doesn't, point it out and a suggestion as to what environment variable is needed.

The VM runs NixOS. If you need a specific tool, you can use `nix shell` to access it.
Prefer already installed and available tools to downloading new ones.

