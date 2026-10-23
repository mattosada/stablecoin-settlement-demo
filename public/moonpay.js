// Opens the MoonPay sandbox widget in #widget-container.
// Signing happens server-side: the secret key never reaches the browser.
const getJson = (url, options) => fetch(url, options).then((r) => r.json());

async function openMoonPay(flow, params, handlers = {}) {
  const { apiKey } = await getJson('/api/moonpay/key');

  // MoonPay checks the IP it sees from this browser, so ask MoonPay for it directly.
  const { ipAddress } = await getJson(`https://api.moonpay.com/v4/ip_address?apiKey=${apiKey}`);
  const { allowedIpAddress } = await getJson(`/api/moonpay/ip-hash?ip=${encodeURIComponent(ipAddress)}`);

  const sdk = window.MoonPayWebSdk.init({
    flow,
    environment: 'sandbox',
    variant: 'embedded',
    containerNodeSelector: '#widget-container',
    params: { apiKey, allowedIpAddress, ...params },
    handlers,
  });

  const { signature } = await getJson('/api/moonpay/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urlForSignature: sdk.generateUrlForSigning() }),
  });

  sdk.updateSignature(signature);
  sdk.show();
}
