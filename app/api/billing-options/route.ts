import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "../../../db";
import { businessProfiles } from "../../../db/schema";
import { getChatGPTUser } from "../../company-auth";
import { listCustomers } from "../../customers/customer-store";
import { listProducts } from "../../products/product-store";
import { demoBusinessProfile } from "../../other/business/demo-profile";
export async function GET(request: Request) {
  const user = await getChatGPTUser(request);
  if (!user)
    return NextResponse.json(
      { message: "Please sign in again." },
      { status: 401 },
    );
  try {
    const [customers, products, profiles] = await Promise.all([
      listCustomers(user.id),
      listProducts(user.id),
      getDb()
        .select()
        .from(businessProfiles)
        .where(eq(businessProfiles.ownerUserId, user.id))
        .limit(1),
    ]);
    return NextResponse.json({
      customers,
      products,
      profile: profiles[0] || demoBusinessProfile,
    });
  } catch (error) {
    console.error("Billing options unavailable", error);
    return NextResponse.json(
      { message: "Billing data is temporarily unavailable." },
      { status: 500 },
    );
  }
}
