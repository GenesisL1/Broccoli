<?php
/*
 * Broccoli (GenesisL1) — optional NCBI E-utilities proxy.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * You do not need this file: the search page and the library talk to NCBI
 * directly from the browser. A proxy helps when you want to
 *   - keep one NCBI API key on your server, so every visitor gets the higher
 *     rate limit without entering a key of their own, or
 *   - serve visitors on networks that block requests to third-party sites.
 *
 * Setup (PHP 7.4 or newer, with the curl extension or allow_url_fopen):
 *   1. Copy this file to your web server, next to or away from the page.
 *   2. Set the options below, or the matching environment variables.
 *   3. In the page's settings, set "E-utilities address" to
 *        https://your.server/path/eutils-proxy.php?u=
 *      or in code: new Broccoli.PubMedClient({ baseUrl: 'https://your.server/path/eutils-proxy.php?u=' })
 *
 * Only a fixed list of E-utilities and databases is forwarded, the API key is
 * added on the server (a key sent by the browser is ignored), and requests
 * are spaced to stay within NCBI's limits for the key. By default only pages
 * from the same site may use the proxy; set BROCCOLI_ALLOWED_ORIGINS when the
 * search page is served from elsewhere. Please keep NCBI's usage policy in
 * mind: https://www.ncbi.nlm.nih.gov/books/NBK25497/
 *
 * Try it locally: from the project folder run  php -S localhost:8000
 *   then open http://localhost:8000/ and set the E-utilities address to
 *   http://localhost:8000/server/eutils-proxy.php?u=
 */

// Notices must never end up inside the XML or JSON sent back to the browser.
ini_set('display_errors', '0');

// ---------------------------------------------------------------- settings

// NCBI API key (https://www.ncbi.nlm.nih.gov/account/settings/). Empty: no key.
define('BROCCOLI_API_KEY', getenv('BROCCOLI_API_KEY') ?: '');
// Contact e-mail sent to NCBI with every request, as the usage policy asks.
define('BROCCOLI_EMAIL', getenv('BROCCOLI_EMAIL') ?: '');
// Tool name sent to NCBI.
define('BROCCOLI_TOOL', getenv('BROCCOLI_TOOL') ?: 'broccoli');
// Pages allowed to use the proxy (and so your key), comma-separated origins
// such as "https://example.org". "self" is the site serving this file; "*"
// lets any website use it. Requests from outside a browser carry no origin
// and cannot be limited this way.
define('BROCCOLI_ALLOWED_ORIGINS', getenv('BROCCOLI_ALLOWED_ORIGINS') ?: 'self');
// Upstream address (change only for testing).
define('BROCCOLI_UPSTREAM', getenv('BROCCOLI_UPSTREAM') ?: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/');
// Requests per second for the whole server: NCBI allows 10 with a key, 3 without.
define('BROCCOLI_RATE', (float) (getenv('BROCCOLI_RATE') ?: (BROCCOLI_API_KEY !== '' ? 9 : 3)));

const BROCCOLI_UTILITIES = ['esearch.fcgi', 'efetch.fcgi', 'espell.fcgi', 'esummary.fcgi', 'einfo.fcgi'];
const BROCCOLI_DATABASES = ['pubmed'];
const BROCCOLI_MAX_BODY = 262144;  // bytes of form data accepted from the browser
const BROCCOLI_TIMEOUT = 60;       // seconds
const BROCCOLI_MAX_WAIT = 10;      // seconds a request may queue for its turn before a 429

// ---------------------------------------------------------------- helpers

function broccoli_fail($status, $message)
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => $message]);
    exit;
}

function broccoli_own_origin()
{
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && strtolower($_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https');
    $host = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : '';
    return ($https ? 'https' : 'http') . '://' . $host;
}

function broccoli_cors()
{
    $origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
    $allowed = array_map('trim', explode(',', BROCCOLI_ALLOWED_ORIGINS));
    if (in_array('self', $allowed, true)) {
        $allowed[] = broccoli_own_origin();
    }
    if (in_array('*', $allowed, true)) {
        header('Access-Control-Allow-Origin: *');
    } elseif ($origin !== '' && in_array($origin, $allowed, true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
    } elseif ($origin !== '') {
        broccoli_fail(403, 'This page is not allowed to use the proxy (see BROCCOLI_ALLOWED_ORIGINS)');
    }
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Access-Control-Max-Age: 86400');
}

/** Parses a query string or form body without PHP's renaming of dots and brackets. */
function broccoli_parse_params($raw)
{
    $params = [];
    if ($raw === '' || $raw === null) {
        return $params;
    }
    foreach (explode('&', $raw) as $pair) {
        if ($pair === '') {
            continue;
        }
        $kv = explode('=', $pair, 2);
        $key = urldecode($kv[0]);
        $value = isset($kv[1]) ? urldecode($kv[1]) : '';
        $params[$key] = $value;
    }
    return $params;
}

/**
 * Spaces requests from all visitors so the server stays within the rate:
 * each request books the next free time slot (briefly holding a file lock),
 * then waits for it without the lock. A request whose slot is too far away
 * gets a 429, which the client retries later.
 */
function broccoli_wait_for_slot()
{
    $interval = 1.0 / max(0.1, BROCCOLI_RATE);
    $file = rtrim(sys_get_temp_dir(), '/\\') . DIRECTORY_SEPARATOR . 'broccoli-eutils-' . md5(__FILE__) . '.lock';
    $fh = @fopen($file, 'c+');
    if (!$fh) {
        return;
    }
    $slot = 0.0;
    if (flock($fh, LOCK_EX)) {
        $last = (float) stream_get_contents($fh);
        $now = microtime(true);
        $slot = max($now, $last + $interval);
        if ($slot - $now > BROCCOLI_MAX_WAIT) {
            flock($fh, LOCK_UN);
            fclose($fh);
            header('Retry-After: ' . (int) ceil($slot - $now - BROCCOLI_MAX_WAIT + 1));
            broccoli_fail(429, 'Too many requests are waiting; try again shortly');
        }
        ftruncate($fh, 0);
        rewind($fh);
        fwrite($fh, sprintf('%.6f', $slot));
        fflush($fh);
        flock($fh, LOCK_UN);
    }
    fclose($fh);
    $wait = $slot - microtime(true);
    if ($wait > 0) {
        usleep((int) ($wait * 1e6));
    }
}

/** Sends the request upstream. Returns [status, contentType, body]. */
function broccoli_forward($url, $method, $body)
{
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_TIMEOUT => BROCCOLI_TIMEOUT,
            CURLOPT_CONNECTTIMEOUT => 15,
            CURLOPT_USERAGENT => 'broccoli-eutils-proxy/1.0',
            CURLOPT_HTTPHEADER => ['Accept: */*'],
        ]);
        if ($method === 'POST') {
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
            curl_setopt($ch, CURLOPT_HTTPHEADER, ['Accept: */*', 'Content-Type: application/x-www-form-urlencoded']);
        }
        $response = curl_exec($ch);
        if ($response === false) {
            broccoli_fail(502, 'Upstream request failed: ' . curl_error($ch));
        }
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $type = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
        if (PHP_VERSION_ID < 80000) {
            curl_close($ch);  // a no-op, and deprecated, from PHP 8 on
        }
        return [$status, $type, $response];
    }
    $context = stream_context_create(['http' => [
        'method' => $method,
        'header' => "Accept: */*\r\nUser-Agent: broccoli-eutils-proxy/1.0\r\n" .
            ($method === 'POST' ? "Content-Type: application/x-www-form-urlencoded\r\n" : ''),
        'content' => $method === 'POST' ? $body : null,
        'timeout' => BROCCOLI_TIMEOUT,
        'ignore_errors' => true,
        'follow_location' => 0,
    ]]);
    $response = @file_get_contents($url, false, $context);
    if ($response === false) {
        broccoli_fail(502, 'Upstream request failed');
    }
    $status = 502;
    $type = '';
    foreach (isset($http_response_header) ? $http_response_header : [] as $line) {
        if (preg_match('#^HTTP/\S+\s+(\d{3})#', $line, $m)) {
            $status = (int) $m[1];
        } elseif (stripos($line, 'Content-Type:') === 0) {
            $type = trim(substr($line, 13));
        }
    }
    return [$status, $type, $response];
}

// ---------------------------------------------------------------- request

broccoli_cors();
$method = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if ($method !== 'GET' && $method !== 'POST') {
    broccoli_fail(405, 'Use GET or POST');
}

$query = broccoli_parse_params(isset($_SERVER['QUERY_STRING']) ? $_SERVER['QUERY_STRING'] : '');
$utility = isset($query['u']) ? $query['u'] : '';
unset($query['u']);
if (!in_array($utility, BROCCOLI_UTILITIES, true)) {
    broccoli_fail(400, 'Unknown or disallowed E-utility');
}

$form = [];
if ($method === 'POST') {
    $raw = file_get_contents('php://input', false, null, 0, BROCCOLI_MAX_BODY + 1);
    if ($raw !== false && strlen($raw) > BROCCOLI_MAX_BODY) {
        broccoli_fail(413, 'Request too large');
    }
    $form = broccoli_parse_params($raw === false ? '' : $raw);
}

$params = array_merge($query, $form);
if ($utility !== 'einfo.fcgi' || isset($params['db'])) {
    $db = isset($params['db']) ? $params['db'] : '';
    if (!in_array($db, BROCCOLI_DATABASES, true)) {
        broccoli_fail(400, 'Database not allowed');
    }
}
// The server's identity and key replace whatever the browser sent.
unset($params['api_key'], $params['tool'], $params['email']);
$params['tool'] = BROCCOLI_TOOL;
if (BROCCOLI_EMAIL !== '') {
    $params['email'] = BROCCOLI_EMAIL;
}
if (BROCCOLI_API_KEY !== '') {
    $params['api_key'] = BROCCOLI_API_KEY;
}

$encoded = http_build_query($params, '', '&', PHP_QUERY_RFC3986);
$url = rtrim(BROCCOLI_UPSTREAM, '/') . '/' . $utility;
broccoli_wait_for_slot();
if ($method === 'POST') {
    list($status, $type, $body) = broccoli_forward($url, 'POST', $encoded);
} else {
    list($status, $type, $body) = broccoli_forward($url . '?' . $encoded, 'GET', null);
}

if (BROCCOLI_API_KEY !== '') {
    // NCBI's error messages can quote the key; it stays on the server.
    $body = str_replace(BROCCOLI_API_KEY, '[api key]', $body);
}
http_response_code($status ?: 502);
header('Content-Type: ' . ($type !== '' ? $type : 'text/plain; charset=utf-8'));
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
echo $body;
