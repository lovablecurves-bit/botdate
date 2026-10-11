import Stripe from "stripe";

let client: Stripe | undefined;
let clientKey = "";

export function getStripe(secretKey: string): Stripe {
  if (!client || clientKey !== secretKey) {
    client = new Stripe(secretKey);
    clientKey = secretKey;
  }
  return client;
}
