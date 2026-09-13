import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const DEMO_PASSWORD = "ChangeMe123!";

async function main() {
  console.log("Seeding Bookwise demo data...");
  const pw = await bcrypt.hash(DEMO_PASSWORD, 12);

  await prisma.businessSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      businessName: "Glow & Go Salon",
      tagline: "Look good, feel great — book your next visit online",
      heroImageUrl: "https://picsum.photos/seed/glowandgo-salon/1920/1080",
      primaryColor: "#2E5C8A",
      address: "123 Main Street, Abbottabad",
      phone: "+92 300 1234567",
      email: "hello@glowandgo-demo.com",
      currency: "USD",
    },
  });

  await prisma.user.upsert({
    where: { email: "owner@bookwise-demo.com" },
    update: {},
    create: { email: "owner@bookwise-demo.com", passwordHash: pw, role: "OWNER" },
  });

  const services = [
    { name: "Haircut & Style", description: "Wash, cut, and blow-dry", durationMins: 45, price: 35 },
    { name: "Hair Coloring", description: "Full color treatment", durationMins: 120, price: 90 },
    { name: "Manicure", description: "Classic manicure", durationMins: 30, price: 20 },
    { name: "Pedicure", description: "Classic pedicure", durationMins: 40, price: 25 },
    { name: "Facial Treatment", description: "Deep-cleansing facial", durationMins: 60, price: 50 },
  ];
  for (const s of services) {
    await prisma.service.upsert({ where: { name: s.name }, update: {}, create: s });
  }

  const staffDefs = [
    { first: "Amelia", last: "Reyes", title: "Senior Stylist", email: "amelia@bookwise-demo.com" },
    { first: "Noah", last: "Bennett", title: "Colorist", email: "noah@bookwise-demo.com" },
    { first: "Priya", last: "Anand", title: "Nail Technician", email: "priya@bookwise-demo.com" },
  ];
  for (const s of staffDefs) {
    const user = await prisma.user.upsert({
      where: { email: s.email },
      update: {},
      create: { email: s.email, passwordHash: pw, role: "STAFF" },
    });
    const staff = await prisma.staff.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, firstName: s.first, lastName: s.last, title: s.title },
    });
    for (const weekday of [1, 2, 3, 4, 5, 6]) {
      await prisma.staffSchedule.upsert({
        where: { staffId_weekday: { staffId: staff.id, weekday } },
        update: {},
        create: { staffId: staff.id, weekday, startTime: "09:00", endTime: "18:00" },
      });
    }
  }

  const firstNames = ["Sara", "Ali", "Zara", "Omar", "Hina", "Ahmed", "Layla", "Bilal", "Noor", "Hamza"];
  const lastNames = ["Khan", "Ahmed", "Malik", "Hassan", "Baig", "Sheikh"];
  for (let i = 0; i < 15; i++) {
    const first = firstNames[i % firstNames.length];
    const last = lastNames[i % lastNames.length];
    const phone = `03${(300000000 + i * 1111).toString().slice(0, 9)}`;
    const year = new Date().getFullYear();
    const counter = await prisma.counter.upsert({
      where: { key: `CLI_${year}` },
      update: { value: { increment: 1 } },
      create: { key: `CLI_${year}`, value: 1 },
    });
    const clientNo = `CLI-${year}-${String(counter.value).padStart(6, "0")}`;
    await prisma.client.create({
      data: { clientNo, firstName: first, lastName: last, phone, email: `${first.toLowerCase()}${i}@example.com` },
    });
  }

  console.log("Seed complete.");
  console.log(`Demo password for every seeded account: ${DEMO_PASSWORD}`);
  console.log("Accounts: owner@bookwise-demo.com, amelia@bookwise-demo.com, noah@bookwise-demo.com, priya@bookwise-demo.com");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
