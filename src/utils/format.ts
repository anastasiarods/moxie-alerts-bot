export function formatNumber(numberString: string, precision?: number): string {
  const [integerPart, decimalPart] = numberString.split(".");
  const bigIntPart = BigInt(integerPart);

  // Format the integer part manually
  let formattedIntegerPart = "";
  const integerStr = bigIntPart.toString();
  for (let i = 0; i < integerStr.length; i++) {
    if (i > 0 && (integerStr.length - i) % 3 === 0) {
      formattedIntegerPart += ",";
    }
    formattedIntegerPart += integerStr[i];
  }

  // Format the decimal part
  const formattedDecimalPart = decimalPart
    ? parseFloat("0." + decimalPart)
        .toFixed(precision ?? 3)
        .split(".")[1]
    : null;

  return formattedIntegerPart + (formattedDecimalPart ? "." + formattedDecimalPart : "");
}
