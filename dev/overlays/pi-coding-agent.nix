final: prev:
{
  # Temporary override while nixpkgs-unstable lags behind upstream.
  # For an update, change version and reset both hashes to final.lib.fakeHash.
  pi-coding-agent = prev.pi-coding-agent.overrideAttrs (_old: rec {
    version = "0.80.6";

    src = final.fetchFromGitHub {
      owner = "earendil-works";
      repo = "pi";
      tag = "v${version}";
      hash = "sha256-e/wcHruEcBAHDF5tKvwew7LXjVp0eraHh2k+QaL2sCA=";
    };

    npmDepsHash = "sha256-xXEOR0epZcfbXayYGyJdBiFVliamBexqA+1Sd7wlGhU=";

    # buildNpmPackage computed this from the original package attributes
    # before overrideAttrs ran, so recreate it for the updated source.
    npmDeps = (final.fetchNpmDeps {
      inherit src;
      hash = npmDepsHash;
    });
  });
}
