import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const approvedEmail = (value: string) =>
  /^[^\s@]+@(skct\.edu\.in|skcet\.ac\.in)$/i.test(value.trim());

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value.trim().toUpperCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomPart(length: number) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function getEncryptionKey() {
  const secret = Deno.env.get("STAFF_INVITATION_ENCRYPTION_KEY");
  if (!secret || secret.length < 32) {
    throw new Error(
      "STAFF_INVITATION_ENCRYPTION_KEY is missing or shorter than 32 characters.",
    );
  }

  const rawKey = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret),
  );

  return await crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptInvitationCode(code: string) {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(code),
  );

  // Store IV and ciphertext together. The encryption secret remains server-side.
  return `${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`;
}

async function decryptInvitationCode(value: string) {
  const [ivPart, encryptedPart] = value.split(".");
  if (!ivPart || !encryptedPart) {
    throw new Error("Stored invitation ciphertext has an invalid format.");
  }

  const key = await getEncryptionKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivPart) },
    key,
    fromBase64(encryptedPart),
  );

  return new TextDecoder().decode(decrypted);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: "Server configuration is incomplete" }, 500);
  }

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const action = String(body.action || "");
  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Public preflight validation only checks a high-entropy, email-bound,
  // Staff-ID-bound invitation. It does not consume the invitation.
  if (action === "validate-invitation") {
    const email = String(body.email || "").trim().toLowerCase();
    const staffCode = String(body.staffCode || "").trim().toUpperCase();
    const code = String(body.invitationCode || "").trim();

    if (!approvedEmail(email)) {
      return json({
        error: "Use @skct.edu.in or @skcet.ac.in for staff registration.",
      }, 400);
    }
    if (!staffCode || !code) {
      return json({ error: "Staff ID and invitation code are required." }, 400);
    }

    const { data, error } = await adminClient
      .from("staff_invitations")
      .select("id,expires_at,redeemed_at,revoked_at")
      .eq("code_hash", await sha256(code))
      .eq("email", email)
      .eq("staff_code", staffCode)
      .maybeSingle();

    if (error) {
      return json({
        error: "Could not validate the invitation. Please try again.",
      }, 500);
    }

    if (
      !data || data.revoked_at || data.redeemed_at ||
      new Date(data.expires_at) <= new Date()
    ) {
      return json({
        error: "Invalid, expired, revoked or already-used invitation. Check the email, Staff ID and code with your administrator.",
      }, 400);
    }

    return json({ valid: true });
  }


  // Public staff registration is protected by a high-entropy, email-bound,
  // Staff-ID-bound, expiring, single-use invitation. No client-supplied role
  // is accepted. The Auth user is confirmed only after this invitation checks.
  if (action === "register-staff") {
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const fullName = String(body.fullName || "").trim().slice(0, 120);
    const staffCode = String(body.staffCode || "").trim().toUpperCase();
    const invitationCode = String(body.invitationCode || "").trim();

    if (!approvedEmail(email)) {
      return json({
        error: "Use your official college email ending in @skct.edu.in or @skcet.ac.in.",
      }, 400);
    }
    if (password.length < 8 || password.length > 128) {
      return json({ error: "Password must contain between 8 and 128 characters." }, 400);
    }
    if (fullName.length < 2) {
      return json({ error: "Enter your full name." }, 400);
    }
    if (!staffCode || staffCode.length > 80 || !invitationCode || invitationCode.length > 200) {
      return json({ error: "Enter the Staff ID and invitation code supplied by your administrator." }, 400);
    }

    const codeHash = await sha256(invitationCode);

    // Check the invitation before creating an Auth user. The SQL redemption
    // below repeats all checks under a row lock and is the authoritative consume.
    const { data: invitation, error: invitationError } = await adminClient
      .from("staff_invitations")
      .select("id,email,staff_code,expires_at,redeemed_at,revoked_at")
      .eq("code_hash", codeHash)
      .eq("email", email)
      .eq("staff_code", staffCode)
      .maybeSingle();

    if (invitationError) {
      return json({ error: "Could not validate the staff invitation. Please try again." }, 500);
    }
    if (
      !invitation ||
      invitation.revoked_at ||
      invitation.redeemed_at ||
      new Date(invitation.expires_at).getTime() <= Date.now()
    ) {
      return json({
        error: "Invalid, expired, revoked or already-used invitation. Check your college email, Staff ID and invitation key.",
      }, 400);
    }

    const { data: existingStaff, error: staffLookupError } = await adminClient
      .from("staff_profiles")
      .select("profile_id")
      .eq("staff_code", staffCode)
      .maybeSingle();

    if (staffLookupError) {
      return json({ error: "Could not verify the Staff ID. Please try again." }, 500);
    }
    if (existingStaff) {
      return json({ error: "This Staff ID is already linked to a CampusPulse staff account." }, 409);
    }

    // Supabase's global Confirm email setting is intentionally left enabled.
    // This one user is confirmed server-side because the admin invitation is
    // the staff onboarding proof. Student signups still use auth.signUp().
    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (createError || !created.user) {
      const message = createError?.message || "Could not create the staff account.";
      if (/already|registered|exists/i.test(message)) {
        return json({
          error: "An account already exists for this email. Sign in with that account or contact the administrator before requesting another invitation.",
        }, 409);
      }
      return json({ error: message }, 400);
    }

    // redeem_staff_invitation validates the confirmed Auth email, exact email,
    // Staff ID, key hash, expiry and status, then promotes the profile and
    // consumes the invitation in one database transaction.
    const { data: redemption, error: redemptionError } = await adminClient.rpc(
      "redeem_staff_invitation",
      {
        p_user_id: created.user.id,
        p_email: email,
        p_staff_code: staffCode,
        p_code_hash: codeHash,
      },
    );

    if (redemptionError || redemption?.success !== true) {
      // Avoid leaving a confirmed but unprivileged orphan account behind.
      const { error: cleanupError } = await adminClient.auth.admin.deleteUser(created.user.id);
      if (cleanupError) {
        console.error(
          "Staff registration rollback failed for Auth user",
          created.user.id,
          cleanupError.message,
        );
      }
      return json({
        error: redemptionError?.message || "The invitation could not be redeemed. No staff account was activated.",
      }, 400);
    }

    return json({
      success: true,
      role: "staff",
      message: "Staff account created and activated.",
    });
  }

  // All remaining actions require an authenticated Supabase user.
  const authorization = req.headers.get("Authorization");
  if (!authorization) {
    return json({ error: "Authentication required" }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) {
    return json({
      error: "Your session is invalid. Please sign in again.",
    }, 401);
  }

  const currentUser = authData.user;
  const currentEmail = (currentUser.email || "").toLowerCase();

  if (action === "complete-registration") {
    if (!currentUser.email_confirmed_at) {
      return json({
        error: "Verify your college email before activating your staff account.",
      }, 403);
    }
    if (!approvedEmail(currentEmail)) {
      return json({
        error: "Use an approved college email: @skct.edu.in or @skcet.ac.in.",
      }, 403);
    }

    const invitationCode = String(body.invitationCode || "").trim();
    const staffCode = String(body.staffCode || "").trim().toUpperCase();

    if (!invitationCode || !staffCode) {
      return json({
        error: "Invitation code and Staff ID are required.",
      }, 400);
    }

    const { data, error } = await adminClient.rpc("redeem_staff_invitation", {
      p_user_id: currentUser.id,
      p_email: currentEmail,
      p_staff_code: staffCode,
      p_code_hash: await sha256(invitationCode),
    });

    if (error) return json({ error: error.message }, 400);
    return json({ success: true, role: "staff", result: data });
  }

  // Only an existing administrator may list, create, or revoke invitations.
  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (profileError || profile?.role !== "admin") {
    return json({
      error: "Only an existing administrator can manage staff invitations.",
    }, 403);
  }

  // This action is required by StaffInvitationManager in src/App.tsx.
  if (action === "list-invitations") {
    const { data: invitations, error } = await adminClient
      .from("staff_invitations")
      .select(
        "id,email,staff_code,department_id,expires_at,redeemed_at,revoked_at,encrypted_code,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      return json({ error: `Could not load invitations: ${error.message}` }, 400);
    }

    const now = Date.now();
    const result = [];

    for (const invitation of invitations || []) {
      let displayCode: string | null = null;
      const isPending =
        !invitation.revoked_at &&
        !invitation.redeemed_at &&
        new Date(invitation.expires_at).getTime() > now;

      if (isPending && invitation.encrypted_code) {
        try {
          displayCode = await decryptInvitationCode(invitation.encrypted_code);
        } catch (error) {
          console.error(
            "Could not decrypt invitation",
            invitation.id,
            error instanceof Error ? error.message : error,
          );
          // Keep the list available; show this key as unavailable instead.
        }
      }

      result.push({
        id: invitation.id,
        email: invitation.email,
        staff_code: invitation.staff_code,
        department_id: invitation.department_id,
        expires_at: invitation.expires_at,
        redeemed_at: invitation.redeemed_at,
        revoked_at: invitation.revoked_at,
        created_at: invitation.created_at,
        display_code: displayCode,
      });
    }

    return json({ invitations: result });
  }

  if (action === "create-invitation") {
    const email = String(body.email || "").trim().toLowerCase();
    const staffCode = String(body.staffCode || "").trim().toUpperCase();
    const departmentId = body.departmentId ? String(body.departmentId) : null;
    const designation = body.designation
      ? String(body.designation).trim().slice(0, 120)
      : null;
    const hours = Number(body.expiresInHours);

    if (!approvedEmail(email)) {
      return json({
        error: "Staff email must end in @skct.edu.in or @skcet.ac.in.",
      }, 400);
    }
    if (!staffCode || staffCode.length > 80) {
      return json({ error: "Enter a valid Staff ID." }, 400);
    }
    if (![24, 48, 72, 168].includes(hours)) {
      return json({ error: "Choose a supported invitation expiry." }, 400);
    }

    const { data: existingStaff, error: staffLookupError } = await adminClient
      .from("staff_profiles")
      .select("profile_id")
      .eq("staff_code", staffCode)
      .maybeSingle();

    if (staffLookupError) {
      return json({ error: "Could not verify the Staff ID." }, 400);
    }
    if (existingStaff) {
      return json({
        error: "This Staff ID is already linked to a CampusPulse staff account.",
      }, 409);
    }

    if (departmentId) {
      const { data: department, error } = await adminClient
        .from("departments")
        .select("id")
        .eq("id", departmentId)
        .maybeSingle();

      if (error || !department) {
        return json({ error: "Selected department was not found." }, 400);
      }
    }

    const code = `CP-${randomPart(6)}-${randomPart(6)}`;

    // Encrypt before revoking an older invitation, so a missing encryption
    // secret cannot invalidate an existing invitation.
    let encryptedCode: string;
    try {
      encryptedCode = await encryptInvitationCode(code);
    } catch (error) {
      console.error(
        "Invitation encryption setup error:",
        error instanceof Error ? error.message : error,
      );
      return json({
        error: "Invitation encryption is not configured. Check STAFF_INVITATION_ENCRYPTION_KEY in Edge Function secrets.",
      }, 500);
    }

    // A newly issued invitation supersedes any unused invitation for this email.
    const { error: revokeError } = await adminClient
      .from("staff_invitations")
      .update({ revoked_at: new Date().toISOString() })
      .eq("email", email)
      .is("redeemed_at", null)
      .is("revoked_at", null);

    if (revokeError) {
      return json({ error: revokeError.message }, 400);
    }

    const { data, error } = await adminClient
      .from("staff_invitations")
      .insert({
        email,
        staff_code: staffCode,
        department_id: departmentId,
        designation,
        code_hash: await sha256(code),
        encrypted_code: encryptedCode,
        expires_at: new Date(
          Date.now() + hours * 60 * 60 * 1000,
        ).toISOString(),
        created_by: currentUser.id,
      })
      .select("id,email,staff_code,expires_at")
      .single();

    if (error) {
      return json({ error: error.message }, 400);
    }

    return json({ success: true, code, invitation: data });
  }

  if (action === "revoke-invitation") {
    const invitationId = String(body.invitationId || "");
    if (!invitationId) {
      return json({ error: "Invitation ID is required." }, 400);
    }

    const { data, error } = await adminClient
      .from("staff_invitations")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", invitationId)
      .is("redeemed_at", null)
      .is("revoked_at", null)
      .select("id")
      .maybeSingle();

    if (error) return json({ error: error.message }, 400);
    if (!data) {
      return json({
        error: "Invitation is already used, expired or revoked.",
      }, 409);
    }

    return json({ success: true });
  }

  return json({ error: `Unknown action: ${action || "(missing)"}` }, 400);
});
