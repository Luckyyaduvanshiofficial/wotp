# ---------------------------------------------------------------------------
# PocketBase — the control plane's data store and back office.
#
# The binary is NOT vendored in this repository (it is ~32 MB and gitignored),
# so the image downloads a pinned release and verifies it against the checksums
# published with that release. A wrong asset name or a tampered download fails
# the build instead of producing a working-looking image.
#
# The version is pinned deliberately: the JSVM migration in pb_migrations/ uses
# the v0.40 collection/field API. Do not float this tag.
# ---------------------------------------------------------------------------
FROM alpine:3.20

# `TARGETARCH` is populated automatically by BuildKit (amd64 / arm64), and
# PocketBase names its release assets with exactly those strings. The default is
# a fallback for classic builders, which do not set it; override it explicitly
# if you build for arm64 without BuildKit.
ARG TARGETARCH=amd64
ARG PB_VERSION=0.40.4

RUN set -eux; \
    apk add --no-cache ca-certificates unzip wget; \
    base="https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}"; \
    asset="pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip"; \
    wget -q -O /tmp/pb.zip "${base}/${asset}"; \
    wget -q -O /tmp/checksums.txt "${base}/checksums.txt"; \
    expected="$(awk -v a="$asset" '$2 == a { print $1 }' /tmp/checksums.txt)"; \
    test -n "$expected"; \
    echo "${expected}  /tmp/pb.zip" | sha256sum -c -; \
    mkdir -p /pb; \
    unzip -q -o /tmp/pb.zip -d /pb; \
    rm -f /tmp/pb.zip /tmp/checksums.txt; \
    chmod +x /pb/pocketbase

# Non-root, and the data dir is created HERE so that a fresh named volume
# inherits this ownership when Docker first populates it.
RUN adduser -D -H -u 10001 waotp \
 && mkdir -p /pb/pb_data \
 && chown -R waotp:waotp /pb

COPY --chown=waotp:waotp docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

WORKDIR /pb
USER waotp

# 8090 serves both the API and the admin UI. Put it behind TLS before exposing
# it: the admin UI is the control plane for every credential this app holds.
EXPOSE 8090

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8090/api/health || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
