FROM kalilinux/kali-rolling:latest@sha256:ed99295a386abde2fb31e01a441b7c2800d9bcf19a20028b77d642c3ef068363
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
  && apt-get install -y --no-install-recommends bash ca-certificates curl dnsutils ffuf feroxbuster iproute2 jq less netcat-openbsd nmap shellinabox sqlmap vim-tiny \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --create-home --uid 10001 --shell /bin/bash student
COPY --chown=student:student welcome.txt /opt/reconlab/welcome.txt
USER student
WORKDIR /home/student
EXPOSE 7681
CMD ["shellinaboxd", "--disable-ssl", "--port=7681", "--service=/:student:student:/home/student:bash -lc 'cat /opt/reconlab/welcome.txt; exec bash -l'"]
