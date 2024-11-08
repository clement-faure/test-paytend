import axios from "axios";
import * as crypto from "crypto";
import fs from "fs";

export class Paytend {
  static PAYTEND_BASE_URL = "https://sandbox-api.paytend.com";

  static PAYTEND_PUBLIC_KEY_PEM = fs.readFileSync(
    "./keys/paytend_public.pem",
    "utf-8"
  );
  static PAYTEND_PRIVATE_KEY_PEM = fs.readFileSync(
    "./keys/paytend_private.pem",
    "utf-8"
  );

  static PARTNER_PUBLIC_KEY_PEM = fs.readFileSync(
    "./keys/partner_public.pem",
    "utf-8"
  );
  static PARTNER_PRIVATE_KEY_PEM = fs.readFileSync(
    "./keys/partner_private.pem",
    "utf-8"
  );

  static PAYTEND_MERCHANT_ID = "312006000003933";
  static PAYTEND_PARTNER_ID = "312006000004128";

  private static utf8Encode(data: string) {
    return Buffer.from(data, "utf-8");
  }

  private static utf8Decode(data: Buffer) {
    return data.toString("utf-8");
  }

  private static base64Encode(bytes: Buffer) {
    return bytes.toString("base64");
  }

  private static base64Decode(data: string) {
    return Buffer.from(data, "base64");
  }

  private static getRandomAESKey() {
    return this.base64Encode(crypto.randomBytes(16));
  }

  private static getOrderedValidUrlParams(params: Record<string, unknown>) {
    return Object.keys(params)
      .sort()
      .map((key) => {
        const value =
          typeof params[key] === "object"
            ? JSON.stringify(params[key])
            : String(params[key]);

        if (value) {
          return `${key}=${value}`;
        }
      })
      .filter((item) => !!item)
      .join("&");
  }

  public static decryptByPrivateKey(encryptedData: Buffer) {
    const decodedData = crypto.privateDecrypt(
      {
        key: this.PAYTEND_PRIVATE_KEY_PEM,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      encryptedData
    );

    return this.utf8Decode(decodedData);
  }

  private static encryptByPublicKey(data: string) {
    const encodedData = crypto.publicEncrypt(
      {
        key: this.PAYTEND_PUBLIC_KEY_PEM,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      this.utf8Encode(data)
    );

    return this.base64Encode(encodedData);
  }

  private static encrypt(content: string, encryptKey: string) {
    const ENCRYPT_ALGORITHM = "aes-192-ecb";

    const key = Buffer.from(encryptKey, "utf-8");

    const cipher = crypto.createCipheriv(ENCRYPT_ALGORITHM, key, null);
    cipher.setAutoPadding(true);

    let encrypted = cipher.update(content, "utf-8", "base64");
    encrypted += cipher.final("base64");

    return encrypted;
  }

  private static decrypt(content: string, encryptKey: string) {
    const DECRYPT_ALGORITHM = "aes-192-ecb";

    const key = Buffer.from(encryptKey, "utf-8");

    const decipher = crypto.createDecipheriv(DECRYPT_ALGORITHM, key, null);
    decipher.setAutoPadding(true);

    let decrypted = decipher.update(content, "base64", "utf-8");
    decrypted += decipher.final("utf-8");

    return decrypted;
  }

  private static signWithPrivateKey(content: string) {
    const sign = crypto.createSign("RSA-SHA256");
    sign.update(content);
    const signature = sign.sign(this.PARTNER_PRIVATE_KEY_PEM, "base64");
    return signature;
  }

  private static verifyWithPublicKey(content: string, signature: string) {
    const verify = crypto.createVerify("RSA-SHA256");
    verify.update(content);
    return verify.verify(this.PARTNER_PUBLIC_KEY_PEM, signature, "base64");
  }

  private static generateSignatureFromBody(body: Record<string, unknown>) {
    const orderedParams = this.getOrderedValidUrlParams(body);
    return this.signWithPrivateKey(orderedParams);
  }

  public static async createPaymentLink({
    amount,
    user,
    customerIp,
    transactionId,
    redirectPath,
    member,
  }: {
    amount: number;
    user: any;
    customerIp: string;
    transactionId: string;
    redirectPath: string;
    member: any;
  }) {
    try {
      // const aesKey = this.getRandomAESKey();
      const aesKey = "lGqBz8CgnQ/XFYQRfaihJg=="; // FIXED AES KEY FOR TESTING

      console.log("AES KEY: ", aesKey);

      const body: Record<string, unknown> = {
        requestId: transactionId, // 32 characters long
        partnerId: this.PAYTEND_PARTNER_ID,
        signType: "RSA",
        version: "2.0",
        randomKey: aesKey,
        bizData: {
          merchantId: this.PAYTEND_MERCHANT_ID,
          orderNo: "stringstringstri",
          amount,
          currency: "EUR",
          cardType: 10,
          email: "test@test.com",
          goodsDesc: "test",
          notificationURL: redirectPath,
          returnURL: redirectPath,
        },
      };

      // The signature source string is composed of all non-empty field contents except the signature field, sorted according to the ASCII code of the message field, and connected with the "&" symbol in the manner of "field name = field value".
      body.signature = this.generateSignatureFromBody(body);

      // Encrypted by randomly generated AES KEY.
      body.bizData = this.encrypt(JSON.stringify(body.bizData), aesKey);

      // AES KEY is encrypted by Paytend public key.
      body.randomKey = this.encryptByPublicKey(aesKey);

      const bodyString = JSON.stringify(body, null, 2);

      console.log("REQUEST: ", bodyString);

      const response = await axios.post(
        this.PAYTEND_BASE_URL + "/wave/payment",
        bodyString,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.status === 200) {
        console.log("RESULT:", JSON.stringify(response.data, null, 2));
      } else {
        console.error("ERROR: ", JSON.stringify(response.data, null, 2));
      }
    } catch (error) {
      console.error("paytend error createPaymentLink", error?.message);
      throw new Error("Error creating payment link");
    }
  }
}

(async () => {
  await Paytend.createPaymentLink({
    amount: 100,
    user: {
      email: "test@figue.io",
    },
    customerIp: "123.123.123.123",
    transactionId: "88866600010020117253477607681610",
    redirectPath: "https://figuecdn-99.localcan.dev",
    member: {},
  });
})();
