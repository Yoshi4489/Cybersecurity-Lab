import ipaddress
import os
import signal
import socketserver
import struct
import threading


DNS_PORT = 5353
TTL = 60
ADDRESS_TOKEN = "address-iris-30"
MAIL_TOKEN = "mail-kestrel-25"
SERVICE_TOKEN = "service-vault-8088"

TYPE_A = 1
TYPE_CNAME = 5
TYPE_PTR = 12
TYPE_MX = 15
TYPE_TXT = 16
TYPE_AAAA = 28
TYPE_SRV = 33
CLASS_IN = 1


def required(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"missing required environment variable: {name}")
    return value


def encode_name(name: str) -> bytes:
    labels = name.rstrip(".").split(".") if name.rstrip(".") else []
    return b"".join(bytes([len(label)]) + label.encode("ascii") for label in labels) + b"\x00"


def decode_name(packet: bytes, offset: int):
    labels = []
    while True:
        length = packet[offset]
        if length == 0:
            return ".".join(labels).lower() + ".", offset + 1
        if length & 0xC0:
            raise ValueError("compressed question names are not supported")
        offset += 1
        labels.append(packet[offset : offset + length].decode("ascii"))
        offset += length


def txt(value: str) -> bytes:
    payload = value.encode("utf-8")
    if len(payload) > 255:
        raise ValueError("TXT record exceeds one DNS character-string")
    return bytes([len(payload)]) + payload


def records():
    return {
        ("entry.recon.test.", TYPE_CNAME): [(TYPE_CNAME, encode_name("atlas.recon.test."))],
        ("atlas.recon.test.", TYPE_A): [(TYPE_A, ipaddress.ip_address("172.28.3.30").packed)],
        ("atlas.recon.test.", TYPE_AAAA): [(TYPE_AAAA, ipaddress.ip_address("fd28:3::30").packed)],
        ("atlas.recon.test.", TYPE_TXT): [
            (
                TYPE_TXT,
                txt(
                    f"address_token={ADDRESS_TOKEN} "
                    f"objective_flag={required('FLAG_L03_ADDRESS_TRAIL')}"
                ),
            )
        ],
        ("recon.test.", TYPE_MX): [(TYPE_MX, struct.pack("!H", 10) + encode_name("mail.recon.test."))],
        ("mail.recon.test.", TYPE_A): [(TYPE_A, ipaddress.ip_address("172.28.3.25").packed)],
        ("mail.recon.test.", TYPE_TXT): [
            (
                TYPE_TXT,
                txt(
                    f"mail_token={MAIL_TOKEN} "
                    f"objective_flag={required('FLAG_L03_MAIL_TRAIL')}"
                ),
            )
        ],
        ("_ops._tcp.recon.test.", TYPE_SRV): [
            (TYPE_SRV, struct.pack("!HHH", 10, 5, 8088) + encode_name("vault.ops.recon.test."))
        ],
        ("vault.ops.recon.test.", TYPE_A): [(TYPE_A, ipaddress.ip_address("172.28.3.30").packed)],
        ("vault.ops.recon.test.", TYPE_TXT): [
            (
                TYPE_TXT,
                txt(
                    f"service_token={SERVICE_TOKEN} "
                    f"objective_flag={required('FLAG_L03_SERVICE_TRAIL')}"
                ),
            )
        ],
        ("30.3.28.172.in-addr.arpa.", TYPE_PTR): [(TYPE_PTR, encode_name("vault.ops.recon.test."))],
    }


def answer(packet: bytes) -> bytes:
    if len(packet) < 12:
        return b""
    transaction_id, request_flags, questions, _, _, _ = struct.unpack("!HHHHHH", packet[:12])
    if questions != 1:
        return struct.pack("!HHHHHH", transaction_id, 0x8401, 0, 0, 0, 0)

    name, end = decode_name(packet, 12)
    if end + 4 > len(packet):
        return b""
    qtype, qclass = struct.unpack("!HH", packet[end : end + 4])
    question = packet[12 : end + 4]
    matches = records().get((name, qtype), []) if qclass == CLASS_IN else []
    flags = 0x8400 | (request_flags & 0x0100)
    header = struct.pack("!HHHHHH", transaction_id, flags, 1, len(matches), 0, 0)
    encoded_answers = []
    for record_type, rdata in matches:
        encoded_answers.append(
            b"\xc0\x0c"
            + struct.pack("!HHIH", record_type, CLASS_IN, TTL, len(rdata))
            + rdata
        )
    return header + question + b"".join(encoded_answers)


class UDPHandler(socketserver.BaseRequestHandler):
    def handle(self):
        packet, sock = self.request
        try:
            response = answer(packet)
            if response:
                sock.sendto(response, self.client_address)
        except (IndexError, UnicodeDecodeError, ValueError):
            return


class TCPHandler(socketserver.BaseRequestHandler):
    def handle(self):
        size_bytes = self.request.recv(2)
        if len(size_bytes) != 2:
            return
        expected = struct.unpack("!H", size_bytes)[0]
        packet = b""
        while len(packet) < expected:
            chunk = self.request.recv(expected - len(packet))
            if not chunk:
                return
            packet += chunk
        try:
            response = answer(packet)
            self.request.sendall(struct.pack("!H", len(response)) + response)
        except (IndexError, UnicodeDecodeError, ValueError):
            return


class ThreadedUDPServer(socketserver.ThreadingMixIn, socketserver.UDPServer):
    allow_reuse_address = True
    daemon_threads = True


class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


servers = [
    ThreadedUDPServer(("0.0.0.0", DNS_PORT), UDPHandler),
    ThreadedTCPServer(("0.0.0.0", DNS_PORT), TCPHandler),
]

for server in servers:
    threading.Thread(target=server.serve_forever, daemon=True).start()


def stop(_signum, _frame):
    for server in servers:
        server.shutdown()


signal.signal(signal.SIGTERM, stop)
signal.pause()
