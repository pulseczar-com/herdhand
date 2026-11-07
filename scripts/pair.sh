#!/bin/sh
# Pairs a phone running Herdhand with this machine, so the phone can sign in with its own key.
#
# Run it on the machine, as the user the phone should sign in as:
#
#   curl -fsSL https://raw.githubusercontent.com/pulseczar-com/herdhand/<tag>/scripts/pair.sh | sh
#
# It adds a one-time key to ~/.ssh/authorized_keys. That key can do one thing, once, for five
# minutes: hand over the phone's public key. It cannot open a shell or a tunnel. The script shows a
# QR code with this machine's address, user, host key fingerprints and the one-time key. The phone
# scans it, signs in with the one-time key over SSH and sends its public key. The script checks
# the key, appends it (as ssh-copy-id does), removes the one-time key and exits. Only the phone's
# key line stays. Nothing is installed.
#
# Needs only a POSIX shell, awk and the OpenSSH tools. Uses qrencode to draw the code when it is
# installed, and its own awk QR encoder when it is not.
#
# The whole script is in functions and runs from the last line, so a half download does nothing.

set -u

PAIR_SECONDS=300
POLL_SECONDS=1
QR_QUIET_MODULES=2

main() {
  umask 077
  require_tools
  authorized_keys="$HOME/.ssh/authorized_keys"
  work_dir=$(mktemp -d) || fail "Cannot make a temporary folder."
  one_time_blob=""
  trap remove_traces EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  trap 'exit 129' HUP

  pending_file="$work_dir/phone.pub"
  require_safe_path "$pending_file"
  deadline=$(($(date +%s) + PAIR_SECONDS))
  make_one_time_key
  guess_address
  link=$(make_pairing_link) || exit 1
  qr=$(draw_qr "$link") || fail "Cannot draw the QR code."
  wait_for_window_to_fit "$qr"
  install_one_time_key

  show_code "$qr"
  wait_for_phone_key
  add_phone_key
}

fail() {
  printf 'Herdhand pairing: %s\n' "$*" >&2
  exit 1
}

require_tools() {
  for tool in ssh-keygen awk mktemp date; do
    command -v "$tool" >/dev/null 2>&1 || fail "This script needs $tool."
  done
}

# The path goes into a command in authorized_keys, inside two levels of quotes.
require_safe_path() {
  case $1 in
    *[!A-Za-z0-9/._-]*) fail "The temporary folder's path has characters this script cannot quote: $1" ;;
  esac
}

# Removes the one-time key and the temporary folder: on success, on error, on Ctrl-C and when
# the terminal closes.
remove_traces() {
  remove_one_time_key
  rm -rf "$work_dir"
}

# --- The one-time key -------------------------------------------------------------------------

make_one_time_key() {
  ssh-keygen -q -t ed25519 -N "" -C "herdhand-pair-$deadline" -f "$work_dir/one-time" </dev/null \
    || fail "ssh-keygen could not make a key."
  one_time_seed=$(read_ed25519_seed "$work_dir/one-time") || fail "Cannot read the one-time key."
}

# Prints the 32-byte seed of an OpenSSH Ed25519 private key file with no passphrase, in base64
# without padding. In that format the seed always starts at byte 161 of the decoded body, after
# a 4-byte length that holds 64 (the seed and the public key).
read_ed25519_seed() {
  LC_ALL=C awk '
    BEGIN { make_base64_tables() }
    /^-----/ { next }
    { body = body $0 }
    END {
      count = decode_base64(body)
      if (count < 225 || bytes[157] != 0 || bytes[158] != 0 || bytes[159] != 0 || bytes[160] != 64) exit 1
      print encode_base64(161, 32)
    }
  '"$AWK_BASE64" "$1"
}

# A forced command: whatever the client asks to run, sshd runs this instead. It writes the text
# the client sent (the phone's key line) to the pending file, once (set -C refuses to overwrite)
# and only before the deadline. The text stays in double quotes, so the shell never runs it.
# The four no-* options, not "restrict", so OpenSSH before 7.2 accepts the line.
install_one_time_key() {
  q="'"
  command="sh -c ${q}test \$(date +%s) -lt $deadline && set -C && printf \\\"%s\\n\\\" \\\"\$SSH_ORIGINAL_COMMAND\\\" > $pending_file${q}"
  options="command=\"$command\",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty"
  one_time_blob=$(awk '{ print $2 }' "$work_dir/one-time.pub")
  append_line "$options $(cat "$work_dir/one-time.pub")"
}

remove_one_time_key() {
  [ -n "$one_time_blob" ] || return 0
  [ -f "$authorized_keys" ] || return 0
  kept="$work_dir/authorized_keys"
  # grep exits 1 when no line is left, which is fine; 2 is an error, so the file stays as it is.
  grep -vF "$one_time_blob" "$authorized_keys" >"$kept"
  [ $? -le 1 ] || return 0
  # cat into the same file keeps its owner, mode and links.
  cat "$kept" >"$authorized_keys"
  one_time_blob=""
}

# Appends a line to authorized_keys the way ssh-copy-id does: a new ~/.ssh is private, a file
# that ends without a newline gets one first, and nothing else in the file changes.
append_line() {
  mkdir -p "$HOME/.ssh" || fail "Cannot make $HOME/.ssh."
  if [ -s "$authorized_keys" ] && [ -n "$(tail -c 1 "$authorized_keys")" ]; then
    echo >>"$authorized_keys"
  fi
  printf '%s\n' "$1" >>"$authorized_keys" || fail "Cannot write $authorized_keys."
  if command -v restorecon >/dev/null 2>&1; then
    restorecon -F "$HOME/.ssh" "$authorized_keys" >/dev/null 2>&1
  fi
}

# --- The pairing link -------------------------------------------------------------------------

# herdhand://pair?v=1&n=<name>&u=<user>&a=<address>&p=<port>&k=<host key fingerprints>&c=<seed>&x=<deadline>
make_pairing_link() {
  fingerprints=$(read_host_key_fingerprints)
  [ -n "$fingerprints" ] || fail "Cannot read this machine's host keys in /etc/ssh."
  name=$(uname -n | cut -d. -f1)
  user=$(id -un)
  printf 'herdhand://pair?v=1&n=%s&u=%s&a=%s&p=%s&k=%s&c=%s&x=%s\n' \
    "$(url_encode "$name")" "$(url_encode "$user")" "$(url_encode "$address")" "$port" \
    "$fingerprints" "$one_time_seed" "$deadline"
}

# The SHA-256 fingerprints of every host key, without the "SHA256:" prefix, comma separated.
read_host_key_fingerprints() {
  for key_file in /etc/ssh/ssh_host_*_key.pub; do
    [ -r "$key_file" ] && ssh-keygen -lf "$key_file" 2>/dev/null
  done | awk '$2 ~ /^SHA256:/ { list = list separator substr($2, 8); separator = "," } END { print list }'
}

# In an SSH session, the address and port the client reached; otherwise the host name and 22.
# The phone may reach the machine another way: the person can change both in the app.
guess_address() {
  # SSH_CONNECTION holds: client address, client port, server address, server port.
  set -- ${SSH_CONNECTION:-}
  if [ $# -eq 4 ]; then
    address=$3
    port=$4
  else
    address=$(uname -n)
    port=22
  fi
}

url_encode() {
  TEXT="$1" LC_ALL=C awk '
    BEGIN {
      for (i = 1; i < 256; i++) code_of[sprintf("%c", i)] = i
      text = ENVIRON["TEXT"]
      for (i = 1; i <= length(text); i++) {
        c = substr(text, i, 1)
        if (c ~ /[A-Za-z0-9._~-]/) out = out c
        else out = out sprintf("%%%02X", code_of[c])
      }
      print out
    }
  '
}

# --- Showing the code -------------------------------------------------------------------------

draw_qr() {
  if command -v qrencode >/dev/null 2>&1; then
    qrencode -t ANSIUTF8 -l L -m "$QR_QUIET_MODULES" "$1" 2>/dev/null && return 0
  fi
  draw_qr_with_awk "$1"
}

# Waits, until the deadline, for a terminal window that can show the whole code.
# The code is square and each text row holds two module rows, so it is about twice as wide as tall.
wait_for_window_to_fit() {
  code_rows=$(printf '%s\n' "$1" | wc -l)
  needed_rows=$((code_rows + 6))
  needed_columns=$((code_rows * 2))
  has_asked=false
  while ! does_window_fit "$needed_rows" "$needed_columns"; do
    if [ "$has_asked" = false ]; then
      echo "Make this window bigger: the code needs $needed_rows rows and $needed_columns columns."
      has_asked=true
    fi
    [ "$(date +%s)" -lt "$deadline" ] || fail "The window stayed too small. Run the command again."
    sleep "$POLL_SECONDS"
  done
}

# True when the window has the rows and columns, or when its size is not known.
does_window_fit() {
  rows_wanted=$1
  columns_wanted=$2
  window_size=$(stty size 2>/dev/null </dev/tty) || return 0
  set -- $window_size
  [ $# -eq 2 ] || return 0
  [ "$1" -ge "$rows_wanted" ] && [ "$2" -ge "$columns_wanted" ]
}

show_code() {
  echo "In Herdhand, tap Add machine, then Scan pairing code, and scan this code."
  echo "It works once, for $((PAIR_SECONDS / 60)) minutes. Show it only where you would type a password."
  printf '%s\n' "$1"
  echo "Waiting for the phone. Press Ctrl-C to stop."
}

# --- Taking the phone's key -------------------------------------------------------------------

wait_for_phone_key() {
  while [ ! -e "$pending_file" ]; do
    if [ "$(date +%s)" -ge "$deadline" ]; then
      fail "No phone paired within $((PAIR_SECONDS / 60)) minutes. Check that the phone can reach $address on port $port, then run the command again."
    fi
    sleep "$POLL_SECONDS"
  done
  # The forced command creates the file and then writes one short line: let it finish.
  sleep "$POLL_SECONDS"
}

# Appends the phone's key, unless it is there already, then removes the one-time key.
add_phone_key() {
  require_phone_key_line "$pending_file"
  phone_line=$(cat "$pending_file")
  phone_blob=$(awk '{ print $2 }' "$pending_file")
  phone_fingerprint=$(ssh-keygen -lf "$pending_file" | awk '{ print $2 }')
  if ! grep -qF "$phone_blob" "$authorized_keys" 2>/dev/null; then
    append_line "$phone_line"
  fi
  remove_one_time_key
  echo "Paired: ${phone_line##* } ($phone_fingerprint)"
}

# One line: an Ed25519 or ECDSA P-256 public key with a "herdhand-..." comment, and nothing that
# authorized_keys would read as options.
require_phone_key_line() {
  line_count=$(wc -l <"$1")
  [ "$line_count" -eq 1 ] || fail "The phone sent something other than one key line."
  grep -Eq '^(ssh-ed25519|ecdsa-sha2-nistp256) [A-Za-z0-9+/]+={0,2} herdhand-[A-Za-z0-9._-]+$' "$1" \
    || fail "The phone sent a line that is not a Herdhand key."
  ssh-keygen -lf "$1" >/dev/null 2>&1 || fail "The phone sent a key that ssh-keygen cannot read."
}

# --- Base64 in awk ----------------------------------------------------------------------------

# Shared by the awk programs above. decode_base64 fills bytes[0..] and returns the count;
# encode_base64 prints count bytes from bytes[first] without padding.
AWK_BASE64='
function make_base64_tables(    i) {
  power_of_two[0] = 1
  for (i = 1; i <= 8; i++) power_of_two[i] = power_of_two[i - 1] * 2
  base64_alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
  for (i = 1; i <= 64; i++) base64_value[substr(base64_alphabet, i, 1)] = i - 1
}

function decode_base64(text,    i, c, accumulated, bit_count, count) {
  accumulated = 0
  bit_count = 0
  count = 0
  for (i = 1; i <= length(text); i++) {
    c = substr(text, i, 1)
    if (!(c in base64_value)) continue
    accumulated = accumulated * 64 + base64_value[c]
    bit_count += 6
    if (bit_count >= 8) {
      bit_count -= 8
      bytes[count++] = int(accumulated / power_of_two[bit_count])
      accumulated = accumulated % power_of_two[bit_count]
    }
  }
  return count
}

function encode_base64(first, count,    i, accumulated, bit_count, out) {
  accumulated = 0
  bit_count = 0
  out = ""
  for (i = first; i < first + count; i++) {
    accumulated = accumulated * 256 + bytes[i]
    bit_count += 8
    while (bit_count >= 6) {
      bit_count -= 6
      out = out substr(base64_alphabet, int(accumulated / power_of_two[bit_count]) + 1, 1)
      accumulated = accumulated % power_of_two[bit_count]
    }
  }
  if (bit_count > 0) out = out substr(base64_alphabet, accumulated * power_of_two[6 - bit_count] + 1, 1)
  return out
}
'

# --- QR code in awk ---------------------------------------------------------------------------

# Draws text as a QR code with half-block characters, light modules in white on black so it
# reads the same on light and dark terminals. Byte mode, error correction level L, versions 1 to
# 40. Ported from Project Nayuki's QR Code generator (MIT License,
# https://www.nayuki.io/page/qr-code-generator-library). POSIX awk has no bit operators, so the
# xor and bit reads use arithmetic. No "^" either: some BusyBox builds have no awk math library.
draw_qr_with_awk() {
  TEXT="$1" QUIET="$QR_QUIET_MODULES" LC_ALL=C awk '
BEGIN {
  # Per version 1 to 40, at error correction level L.
  split("7 10 15 20 26 18 20 24 30 18 20 24 26 30 22 24 28 30 28 28 28 28 30 30 26 28 30 30 30 30 30 30 30 30 30 30 30 30 30 30", ecc_per_block, " ")
  split("1 1 1 1 1 2 2 2 2 4 4 4 4 4 6 6 6 6 7 8 8 9 9 10 12 12 12 13 14 15 16 17 18 19 19 20 21 22 24 25", block_count, " ")
  pow2[0] = 1
  for (i = 1; i <= 24; i++) pow2[i] = pow2[i - 1] * 2
  make_gf_tables()
  if (!read_text(ENVIRON["TEXT"])) exit 2
  version = choose_version(text_length)
  if (version == 0) exit 2
  size = version * 4 + 17
  make_data_codewords()
  add_ecc_and_interleave()
  clear_modules()
  draw_function_patterns()
  draw_codewords()
  mask = choose_mask()
  apply_mask(mask)
  draw_format_bits(mask)
  render(ENVIRON["QUIET"] + 0)
}

function read_text(text,    i, c) {
  for (i = 32; i < 127; i++) code_of[sprintf("%c", i)] = i
  text_length = length(text)
  for (i = 1; i <= text_length; i++) {
    c = substr(text, i, 1)
    if (!(c in code_of)) return 0
    text_bytes[i - 1] = code_of[c]
  }
  return 1
}

function bit_xor(a, b,    result, place) {
  result = 0
  place = 1
  while (a > 0 || b > 0) {
    if (a % 2 != b % 2) result += place
    a = int(a / 2)
    b = int(b / 2)
    place *= 2
  }
  return result
}

function get_bit(value, position) {
  return int(value / pow2[position]) % 2
}

function abs(value) {
  return value < 0 ? -value : value
}

function max(a, b) {
  return a > b ? a : b
}

# --- Data and error correction codewords

function make_gf_tables(    i, x) {
  x = 1
  for (i = 0; i < 255; i++) {
    gf_exp[i] = x
    gf_log[x] = i
    x *= 2
    if (x >= 256) x = bit_xor(x, 285)
  }
}

function gf_multiply(a, b) {
  if (a == 0 || b == 0) return 0
  return gf_exp[(gf_log[a] + gf_log[b]) % 255]
}

function get_raw_data_modules(ver,    result, align_count) {
  result = (16 * ver + 128) * ver + 64
  if (ver >= 2) {
    align_count = int(ver / 7) + 2
    result -= (25 * align_count - 10) * align_count - 55
    if (ver >= 7) result -= 36
  }
  return result
}

function get_data_codeword_count(ver) {
  return int(get_raw_data_modules(ver) / 8) - ecc_per_block[ver] * block_count[ver]
}

function get_count_bits(ver) {
  return ver <= 9 ? 8 : 16
}

function choose_version(count,    ver) {
  for (ver = 1; ver <= 40; ver++) {
    if (4 + get_count_bits(ver) + 8 * count <= get_data_codeword_count(ver) * 8) return ver
  }
  return 0
}

function append_bits(value, count,    i) {
  for (i = count - 1; i >= 0; i--) bits[bit_total++] = get_bit(value, i)
}

# Byte mode header, the text, a terminator, then pad bytes up to the capacity.
function make_data_codewords(    capacity, i, terminator, pad) {
  bit_total = 0
  append_bits(4, 4)
  append_bits(text_length, get_count_bits(version))
  for (i = 0; i < text_length; i++) append_bits(text_bytes[i], 8)
  capacity = get_data_codeword_count(version) * 8
  terminator = capacity - bit_total
  if (terminator > 4) terminator = 4
  append_bits(0, terminator)
  append_bits(0, (8 - bit_total % 8) % 8)
  pad = 236
  while (bit_total < capacity) {
    append_bits(pad, 8)
    pad = 236 + 17 - pad
  }
  for (i = 0; i < bit_total / 8; i++) data[i] = 0
  for (i = 0; i < bit_total; i++) data[int(i / 8)] = data[int(i / 8)] * 2 + bits[i]
}

function make_divisor(degree,    i, j, root) {
  for (i = 0; i < degree - 1; i++) divisor[i] = 0
  divisor[degree - 1] = 1
  root = 1
  for (i = 0; i < degree; i++) {
    for (j = 0; j < degree; j++) {
      divisor[j] = gf_multiply(divisor[j], root)
      if (j + 1 < degree) divisor[j] = bit_xor(divisor[j], divisor[j + 1])
    }
    root = gf_multiply(root, 2)
  }
}

# The Reed-Solomon remainder of block_data[0..count-1], into remainder[0..degree-1].
function compute_remainder(count, degree,    i, j, factor) {
  for (i = 0; i < degree; i++) remainder[i] = 0
  for (i = 0; i < count; i++) {
    factor = bit_xor(block_data[i], remainder[0])
    for (j = 0; j < degree - 1; j++) remainder[j] = remainder[j + 1]
    remainder[degree - 1] = 0
    for (j = 0; j < degree; j++) remainder[j] = bit_xor(remainder[j], gf_multiply(divisor[j], factor))
  }
}

# Splits the data into blocks, adds error correction to each block, and interleaves them. Short
# blocks hold one data codeword less; the pad slot at short_length - ecc_length is skipped.
function add_ecc_and_interleave(    blocks_here, ecc_length, raw_count, short_count, short_length, i, j, k, count) {
  blocks_here = block_count[version]
  ecc_length = ecc_per_block[version]
  raw_count = int(get_raw_data_modules(version) / 8)
  short_count = blocks_here - raw_count % blocks_here
  short_length = int(raw_count / blocks_here)
  make_divisor(ecc_length)
  k = 0
  for (i = 0; i < blocks_here; i++) {
    count = short_length - ecc_length
    if (i >= short_count) count++
    for (j = 0; j < count; j++) block_data[j] = data[k + j]
    k += count
    compute_remainder(count, ecc_length)
    for (j = 0; j < count; j++) blocks[i, j] = block_data[j]
    for (j = 0; j < ecc_length; j++) blocks[i, short_length + 1 - ecc_length + j] = remainder[j]
  }
  codeword_total = 0
  for (j = 0; j <= short_length; j++) {
    for (i = 0; i < blocks_here; i++) {
      if (j != short_length - ecc_length || i >= short_count) codewords[codeword_total++] = blocks[i, j]
    }
  }
}

# --- Placing modules

function clear_modules(    x, y) {
  for (y = 0; y < size; y++) {
    for (x = 0; x < size; x++) {
      modules[x, y] = 0
      is_function[x, y] = 0
    }
  }
}

function set_function_module(x, y, is_dark) {
  modules[x, y] = is_dark
  is_function[x, y] = 1
}

function draw_function_patterns(    i, j, count, last) {
  for (i = 0; i < size; i++) {
    set_function_module(6, i, i % 2 == 0)
    set_function_module(i, 6, i % 2 == 0)
  }
  draw_finder(3, 3)
  draw_finder(size - 4, 3)
  draw_finder(3, size - 4)
  count = make_alignment_positions()
  last = count - 1
  for (i = 0; i < count; i++) {
    for (j = 0; j < count; j++) {
      if (i == 0 && j == 0) continue
      if (i == 0 && j == last) continue
      if (i == last && j == 0) continue
      draw_alignment(alignment[i], alignment[j])
    }
  }
  draw_format_bits(0)
  draw_version()
}

function draw_finder(center_x, center_y,    dx, dy, x, y, distance) {
  for (dy = -4; dy <= 4; dy++) {
    for (dx = -4; dx <= 4; dx++) {
      distance = max(abs(dx), abs(dy))
      x = center_x + dx
      y = center_y + dy
      if (x >= 0 && x < size && y >= 0 && y < size) set_function_module(x, y, distance != 2 && distance != 4)
    }
  }
}

function draw_alignment(center_x, center_y,    dx, dy) {
  for (dy = -2; dy <= 2; dy++) {
    for (dx = -2; dx <= 2; dx++) set_function_module(center_x + dx, center_y + dy, max(abs(dx), abs(dy)) != 1)
  }
}

# Fills alignment[] with the alignment pattern centers and returns how many there are.
function make_alignment_positions(    count, step, i) {
  if (version == 1) return 0
  count = int(version / 7) + 2
  step = int((version * 8 + count * 3 + 5) / (count * 4 - 4)) * 2
  alignment[0] = 6
  for (i = 1; i < count; i++) alignment[count - i] = size - 7 - (i - 1) * step
  return count
}

# Level L is 01. The BCH code protects the 5 data bits; the xor keeps the result from being all zero.
function draw_format_bits(mask_id,    data_bits, rem, i, format) {
  data_bits = 8 + mask_id
  rem = data_bits
  for (i = 0; i < 10; i++) rem = bit_xor(rem * 2, int(rem / 512) * 1335)
  format = bit_xor(data_bits * 1024 + rem, 21522)
  for (i = 0; i <= 5; i++) set_function_module(8, i, get_bit(format, i))
  set_function_module(8, 7, get_bit(format, 6))
  set_function_module(8, 8, get_bit(format, 7))
  set_function_module(7, 8, get_bit(format, 8))
  for (i = 9; i < 15; i++) set_function_module(14 - i, 8, get_bit(format, i))
  for (i = 0; i < 8; i++) set_function_module(size - 1 - i, 8, get_bit(format, i))
  for (i = 8; i < 15; i++) set_function_module(8, size - 15 + i, get_bit(format, i))
  set_function_module(8, size - 8, 1)
}

function draw_version(    rem, i, version_bits, a, b, is_dark) {
  if (version < 7) return
  rem = version
  for (i = 0; i < 12; i++) rem = bit_xor(rem * 2, int(rem / 2048) * 7973)
  version_bits = version * 4096 + rem
  for (i = 0; i < 18; i++) {
    is_dark = get_bit(version_bits, i)
    a = size - 11 + i % 3
    b = int(i / 3)
    set_function_module(a, b, is_dark)
    set_function_module(b, a, is_dark)
  }
}

# Places the codeword bits in the zigzag order: two columns at a time, from the right, going up
# and down in turn, skipping the vertical timing pattern and the function modules.
function draw_codewords(    i, right, vertical, j, x, y, is_upward, total) {
  i = 0
  total = codeword_total * 8
  for (right = size - 1; right >= 1; right -= 2) {
    if (right == 6) right = 5
    is_upward = int((right + 1) / 2) % 2 == 0
    for (vertical = 0; vertical < size; vertical++) {
      for (j = 0; j < 2; j++) {
        x = right - j
        y = is_upward ? size - 1 - vertical : vertical
        if (!is_function[x, y] && i < total) {
          modules[x, y] = get_bit(codewords[int(i / 8)], 7 - i % 8)
          i++
        }
      }
    }
  }
}

# --- Masking

# Applying a mask twice undoes it.
function apply_mask(mask_id,    x, y, product) {
  for (y = 0; y < size; y++) {
    for (x = 0; x < size; x++) {
      if (is_function[x, y]) continue
      product = x * y
      if (is_masked(mask_id, x, y, product)) modules[x, y] = 1 - modules[x, y]
    }
  }
}

function is_masked(mask_id, x, y, product) {
  if (mask_id == 0) return (x + y) % 2 == 0
  if (mask_id == 1) return y % 2 == 0
  if (mask_id == 2) return x % 3 == 0
  if (mask_id == 3) return (x + y) % 3 == 0
  if (mask_id == 4) return (int(x / 3) + int(y / 2)) % 2 == 0
  if (mask_id == 5) return product % 2 + product % 3 == 0
  if (mask_id == 6) return (product % 2 + product % 3) % 2 == 0
  return ((x + y) % 2 + product % 3) % 2 == 0
}

function choose_mask(    mask_id, best, best_score, score) {
  best = 0
  best_score = -1
  for (mask_id = 0; mask_id < 8; mask_id++) {
    apply_mask(mask_id)
    draw_format_bits(mask_id)
    score = get_penalty()
    if (best_score < 0 || score < best_score) {
      best = mask_id
      best_score = score
    }
    apply_mask(mask_id)
  }
  return best
}

# The standard penalty: long runs and finder-like patterns in rows and columns, 2x2 blocks of one
# color, and an uneven share of dark modules.
function get_penalty(    result, x, y, color, dark, total) {
  result = 0
  for (y = 0; y < size; y++) {
    for (x = 0; x < size; x++) line_cells[x] = modules[x, y]
    result += get_line_penalty()
  }
  for (x = 0; x < size; x++) {
    for (y = 0; y < size; y++) line_cells[y] = modules[x, y]
    result += get_line_penalty()
  }
  dark = 0
  for (y = 0; y < size; y++) {
    for (x = 0; x < size; x++) {
      dark += modules[x, y]
      if (x == size - 1 || y == size - 1) continue
      color = modules[x, y]
      if (color == modules[x + 1, y] && color == modules[x, y + 1] && color == modules[x + 1, y + 1]) result += 3
    }
  }
  total = size * size
  result += (int((abs(dark * 20 - total * 10) + total - 1) / total) - 1) * 10
  return result
}

function get_line_penalty(    result, run_color, run_length, i) {
  result = 0
  run_color = 0
  run_length = 0
  for (i = 0; i < 7; i++) run_history[i] = 0
  for (i = 0; i < size; i++) {
    if (line_cells[i] == run_color) {
      run_length++
      if (run_length == 5) result += 3
      else if (run_length > 5) result++
      continue
    }
    add_run_to_history(run_length)
    if (!run_color) result += count_finder_patterns() * 40
    run_color = line_cells[i]
    run_length = 1
  }
  if (run_color) {
    add_run_to_history(run_length)
    run_length = 0
  }
  add_run_to_history(run_length + size)
  return result + count_finder_patterns() * 40
}

# The light border around the code counts as part of the first and last runs.
function add_run_to_history(run_length,    i) {
  if (run_history[0] == 0) run_length += size
  for (i = 6; i > 0; i--) run_history[i] = run_history[i - 1]
  run_history[0] = run_length
}

function count_finder_patterns(    n, is_core, count) {
  n = run_history[1]
  is_core = n > 0 && run_history[2] == n && run_history[4] == n && run_history[5] == n && run_history[3] == n * 3
  count = 0
  if (is_core && run_history[0] >= n * 4 && run_history[6] >= n) count++
  if (is_core && run_history[6] >= n * 4 && run_history[0] >= n) count++
  return count
}

# --- Output

# Two module rows per text row. Light modules are the white foreground.
function render(quiet,    x, y, line, is_top_dark, is_bottom_dark) {
  for (y = -quiet; y < size + quiet; y += 2) {
    line = "\033[40;37m"
    for (x = -quiet; x < size + quiet; x++) {
      is_top_dark = is_dark(x, y)
      is_bottom_dark = is_dark(x, y + 1)
      if (!is_top_dark && !is_bottom_dark) line = line "█"
      else if (!is_top_dark) line = line "▀"
      else if (!is_bottom_dark) line = line "▄"
      else line = line " "
    }
    print line "\033[0m"
  }
}

function is_dark(x, y) {
  if (x < 0 || y < 0 || x >= size || y >= size) return 0
  return modules[x, y]
}
'
}

main "$@"
