FROM kalilinux/kali-rolling

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        bash \
        bind9-dnsutils \
        binutils \
        ca-certificates \
        coreutils \
        curl \
        dnsutils \
        file \
        findutils \
        gawk \
        grep \
        iproute2 \
        jq \
        less \
        netcat-openbsd \
        nmap \
        sed \
        tar \
        ttyd \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 student \
    && useradd --create-home --uid 10001 --gid 10001 --shell /bin/bash student

COPY welcome.txt /opt/cyberlab/welcome.txt
COPY lab-scope /usr/local/bin/lab-scope

RUN chmod 0555 /usr/local/bin/lab-scope \
    && chown -R root:root /opt/cyberlab

USER 10001:10001
WORKDIR /home/student

EXPOSE 7681

CMD ["ttyd", "--writable", "--port", "7681", "--interface", "0.0.0.0", "bash", "-lc", "cat /opt/cyberlab/welcome.txt; lab-scope; exec bash -l"]
