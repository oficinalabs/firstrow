import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signRequest } from "@/lib/r2";

/*
 * ============================================================================
 *  A ASSINATURA SigV4 — provada contra os vetores oficiais da AWS
 * ============================================================================
 *
 * `lib/r2.ts` assina os pedidos à mão em vez de trazer o `@aws-sdk/client-s3`
 * (18 MB, 28 pacotes, para dois pedidos HTTP). A troca só é honesta se o
 * assinador for VERIFICADO, e não "lido e parece bem" — uma assinatura errada
 * falha com `SignatureDoesNotMatch`, que não diz onde.
 *
 * Por isso não se testa "faz o mesmo que na semana passada": comparam-se as
 * assinaturas com as que a AWS publica nos seus exemplos. Se alguém mexer numa
 * das linhas do pedido canónico, isto cai — mesmo que o resultado continue a
 * ser um hexadecimal com bom aspeto.
 *
 * O caminho a sério (bucket, chaves, rede) está provado à parte, na medição do
 * relatório: aqui é aritmética, e aritmética corre em CI sem segredos.
 */

const vazio = createHash("sha256").update("").digest("hex");

describe("signRequest — vetores da suite oficial da AWS", () => {
  /*
   * `get-vanilla`, o vetor mais simples da suite: GET à raiz, sem query, com
   * `host` e `x-amz-date` e mais nada. Cobre o esqueleto todo — pedido
   * canónico, string a assinar, derivação da chave e formato do cabeçalho.
   */
  it("assina o `get-vanilla` exactamente como a AWS", () => {
    const authorization = signRequest({
      method: "GET",
      path: "/",
      headers: {
        host: "example.amazonaws.com",
        "x-amz-date": "20150830T123600Z",
      },
      payloadHash: vazio,
      accessKeyId: "AKIDEXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
      region: "us-east-1",
      service: "service",
      amzDate: "20150830T123600Z",
    });

    expect(authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, " +
        "SignedHeaders=host;x-amz-date, " +
        "Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31",
    );
  });

  /*
   * O exemplo de S3 da documentação ("Transferring Payload in a Single Chunk",
   * GET Object). Acrescenta o que o `get-vanilla` não tem e nós usamos mesmo:
   * um caminho que não é a raiz, o `x-amz-content-sha256`, e o serviço `s3`.
   */
  it("assina o exemplo de GET Object do S3 exactamente como a AWS", () => {
    const authorization = signRequest({
      method: "GET",
      path: "/test.txt",
      headers: {
        host: "examplebucket.s3.amazonaws.com",
        range: "bytes=0-9",
        "x-amz-content-sha256": vazio,
        "x-amz-date": "20130524T000000Z",
      },
      payloadHash: vazio,
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      region: "us-east-1",
      service: "s3",
      amzDate: "20130524T000000Z",
    });

    expect(authorization).toContain(
      "Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request",
    );
    expect(authorization).toContain("SignedHeaders=host;range;x-amz-content-sha256;x-amz-date");
    expect(authorization).toContain(
      "Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
    );
  });
});

describe("signRequest — o que tem de mudar a assinatura", () => {
  type Pedido = Parameters<typeof signRequest>[0];

  const base: Pedido = {
    method: "PUT",
    path: "/balde/canais/abc/logo-1.webp",
    headers: {
      host: "conta.r2.cloudflarestorage.com",
      "content-type": "image/webp",
      "x-amz-content-sha256": vazio,
      "x-amz-date": "20260721T101500Z",
    },
    payloadHash: vazio,
    accessKeyId: "AK",
    secretAccessKey: "SK",
    region: "auto",
    service: "s3",
    amzDate: "20260721T101500Z",
  };

  const assinatura = (partes: Partial<Pedido>) =>
    signRequest({ ...base, ...partes }).split("Signature=")[1];

  it("o corpo entra na conta — mudar os bytes muda a assinatura", () => {
    const outroCorpo = createHash("sha256").update("outra coisa").digest("hex");
    expect(assinatura({ payloadHash: outroCorpo })).not.toBe(assinatura({}));
  });

  it("a chave do objeto entra na conta — assinar para outro caminho não serve", () => {
    // Foi exactamente este o erro que já mordeu esta plataforma: um token
    // assinado, válido, mas para o recurso errado.
    expect(assinatura({ path: "/balde/canais/xyz/logo-1.webp" })).not.toBe(assinatura({}));
  });

  it("o método entra na conta — um PUT assinado não vale como DELETE", () => {
    expect(assinatura({ method: "DELETE" })).not.toBe(assinatura({}));
  });

  it("a hora entra na conta — a mesma assinatura não vale no dia seguinte", () => {
    expect(assinatura({ amzDate: "20260722T101500Z" })).not.toBe(assinatura({}));
  });

  it("os cabeçalhos assinados vão por ordem alfabética, seja qual for a ordem do objeto", () => {
    const trocado = signRequest({
      ...base,
      headers: {
        "x-amz-date": base.headers["x-amz-date"],
        host: base.headers.host,
        "x-amz-content-sha256": base.headers["x-amz-content-sha256"],
        "content-type": base.headers["content-type"],
      },
    });
    expect(trocado).toBe(signRequest({ ...base }));
    expect(trocado).toContain("SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date");
  });
});
