FROM kalilinux/kali-rolling
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
  && apt-get install -y --no-install-recommends bash ca-certificates curl dnsutils ffuf feroxbuster iproute2 jq less netcat-openbsd nmap sqlmap ttyd vim-tiny \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --create-home --uid 10001 --shell /bin/bash student
COPY --chown=student:student welcome.txt /opt/reconlab/welcome.txt
USER student
WORKDIR /home/student
EXPOSE 7681
CMD ["ttyd", "--writable", "--port", "7681", "--interface", "0.0.0.0", "bash", "-lc", "cat /opt/reconlab/welcome.txt; exec bash -l"]
