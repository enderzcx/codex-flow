export function divide(a, b) {
  if (b === 0) {
    return 0;
  }
  return a / b;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(divide(10, 2));
}
