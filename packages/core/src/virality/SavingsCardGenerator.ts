export class SavingsCardGenerator {
  static generateHTML(savingsPercent: number, model: string) {
    return `
      <div style="background: linear-gradient(#0a0a0a, #111); padding: 20px; border-radius: 12px; color: white;">
        <h2>ReaganXS Saved ${savingsPercent}% bandwidth</h2>
        <p>Using ${model.toUpperCase()}</p>
      </div>
    `;
  }
}