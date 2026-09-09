FROM kalilinux/kali-rolling:latest@sha256:ed99295a386abde2fb31e01a441b7c2800d9bcf19a20028b77d642c3ef068363

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        bash \
        tmux \
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
        libcap2-bin \
        netcat-openbsd \
        nmap \
        python3 \
        sed \
        tar \
    && rm -rf /var/lib/apt/lists/* \
    && setcap -r /usr/lib/nmap/nmap \
    && rm -f /etc/profile.d/nmap.sh /etc/X11/Xsession.d/90nmap \
    && groupadd --gid 10001 student \
    && useradd --create-home --uid 10001 --gid 10001 --shell /bin/bash student

COPY welcome.txt /opt/cyberlab/welcome.txt
COPY lab-scope /usr/local/bin/lab-scope

RUN chmod 0555 /usr/local/bin/lab-scope \
    && chown -R root:root /opt/cyberlab

USER 10001:10001
WORKDIR /home/student

CMD ["sleep", "infinity"]
