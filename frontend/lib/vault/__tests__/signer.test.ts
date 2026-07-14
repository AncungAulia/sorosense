import { depositorSigner } from "../signer";

test("depositorSigner has the depositor role and delegates signing", async () => {
  const sign = vi.fn(async (xdr: string) => `signed:${xdr}`);
  const s = depositorSigner("GDEPOSITOR", sign);
  expect(s.role).toBe("depositor");
  expect(s.address).toBe("GDEPOSITOR");
  await expect(s.sign("mock-xdr-1")).resolves.toBe("signed:mock-xdr-1");
  expect(sign).toHaveBeenCalledWith("mock-xdr-1");
});
