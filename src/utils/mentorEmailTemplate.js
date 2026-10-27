/**
 * Generates modern, responsive institutional onboarding HTML and plain-text emails
 * for Faculty Mentors uploaded via the Admin Roster Bulk Import or Individual Onboarding.
 * Follows the exact same theme and structure as the student onboarding email,
 * including a Direct Sign-In action button that pre-fills Mentor ID & Password
 * without auto-logging in until the user clicks the login button.
 */

export const generateMentorOnboardingEmailHtml = ({
  name = 'Faculty Mentor',
  mentorId = '',
  email = '',
  dept = 'CSE',
  assignedClass = 'CSE 5th Sem - Batch A',
  generatedPassword = '',
  portalBaseUrl = 'http://localhost:5173'
}) => {
  const directLoginUrl = `${portalBaseUrl.replace(/\/$/, '')}/?role=Mentor&id=${encodeURIComponent(mentorId)}&pwd=${encodeURIComponent(generatedPassword)}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NITTE Faculty Mentor Account Credentials</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 32px 12px;">
    <tr>
      <td align="center">
        <!-- Main Container Card -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0;">
          
          <!-- Modern Gradient Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #091e42 0%, #1e3a8a 52%, #059669 100%); padding: 36px 32px 28px; text-align: center; color: #ffffff;">
              <div style="display: inline-block; background: rgba(255, 255, 255, 0.15); border: 1px solid rgba(255, 255, 255, 0.25); border-radius: 30px; padding: 5px 16px; font-size: 11px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: #a7f3d0; margin-bottom: 14px;">
                🏛️ NITTE (DEEMED TO BE UNIVERSITY)
              </div>
              <h1 style="margin: 0; font-size: 23px; font-weight: 800; letter-spacing: -0.3px; color: #ffffff; line-height: 1.3;">
                Faculty Mentorship Portal
              </h1>
              <p style="margin: 8px 0 0 0; font-size: 13px; color: #93c5fd; font-weight: 400;">
                Official Faculty Appointment & Direct Access Credentials
              </p>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px 32px 24px;">
              <p style="margin: 0 0 14px; font-size: 16px; color: #0f172a; line-height: 1.5;">
                Dear Prof. / Dr. <strong style="color: #1e3a8a;">${name}</strong>,
              </p>
              <p style="margin: 0 0 18px; font-size: 14px; color: #475569; line-height: 1.6;">
                Welcome to the NITTE Faculty Mentorship Network! Your official faculty advisor account has been provisioned and verified by Institutional Administration. You are now designated as an official mentor on the <strong>NITTE Student Mentorship & Grievance Escalation Portal</strong>.
              </p>

              <!-- Faculty Profile Snapshot Tag -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0; margin-bottom: 22px;">
                <tr>
                  <td style="padding: 12px 18px; font-size: 13px; color: #334155;">
                    <span style="display: inline-block; margin-right: 18px;"><strong>📚 Department:</strong> ${dept}</span>
                    <span style="display: inline-block; margin-right: 18px;"><strong>👥 Mentorship Class:</strong> ${assignedClass || 'General Batch'}</span>
                    <span style="display: inline-block; margin-right: 18px;"><strong>🛡️ Role:</strong> Faculty Mentor</span>
                    <span style="display: inline-block;"><strong>👥 Capacity:</strong> Up to 30 Mentees</span>
                  </td>
                </tr>
              </table>

              <!-- Modern Credentials Box -->
              <div style="background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%); border: 1px solid #cbd5e1; border-top: 4px solid #059669; border-radius: 12px; padding: 20px; margin-bottom: 26px; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">
                  <h3 style="margin: 0; font-size: 15px; font-weight: 700; color: #065f46;">
                    🔐 Official Faculty Login Credentials
                  </h3>
                  <span style="font-size: 11px; background: #ecfdf5; color: #059669; padding: 3px 8px; border-radius: 20px; font-weight: 700; border: 1px solid #a7f3d0;">
                    ✓ Active
                  </span>
                </div>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size: 13px; color: #1e293b; line-height: 1.8;">
                  <tr>
                    <td width="38%" style="color: #64748b; font-weight: 600; padding: 5px 0;">Faculty / Mentor ID:</td>
                    <td style="padding: 5px 0;">
                      <code style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 14px; font-weight: 700; background: #ecfdf5; color: #047857; padding: 3px 8px; border-radius: 6px; border: 1px solid #a7f3d0;">
                        ${mentorId}
                      </code>
                    </td>
                  </tr>
                  <tr>
                    <td style="color: #64748b; font-weight: 600; padding: 5px 0;">Official Email:</td>
                    <td style="padding: 5px 0;">
                      <code style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 13px; color: #334155; background: #f1f5f9; padding: 3px 8px; border-radius: 6px;">
                        ${email}
                      </code>
                    </td>
                  </tr>
                  <tr>
                    <td style="color: #64748b; font-weight: 600; padding: 5px 0;">Generated Password:</td>
                    <td style="padding: 5px 0;">
                      <code style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 15px; font-weight: 800; background: #fef2f2; color: #dc2626; padding: 4px 10px; border-radius: 6px; border: 1px solid #fecaca; letter-spacing: 0.5px;">
                        ${generatedPassword}
                      </code>
                    </td>
                  </tr>
                </table>
              </div>

              <!-- Direct 1-Click Login Button Section -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 24px 0 16px;">
                <tr>
                  <td align="center">
                    <table role="presentation" cellspacing="0" cellpadding="0">
                      <tr>
                        <td align="center" style="border-radius: 10px; background: linear-gradient(135deg, #059669 0%, #047857 100%); box-shadow: 0 4px 16px rgba(5, 150, 105, 0.35);">
                          <a href="${directLoginUrl}" target="_blank" style="display: inline-block; padding: 14px 34px; font-size: 15px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 10px; letter-spacing: 0.2px;">
                            👉 Open Faculty Mentor Portal
                          </a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin: 10px 0 0 0; font-size: 12px; color: #64748b; text-align: center;">
                      ⚡ Pre-fills your Faculty ID & password on the login page. Simply click "Sign In to Faculty Mentor Portal" to enter.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Fallback Direct URL Box -->
              <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 12px; margin-top: 18px; font-size: 12px; color: #475569;">
                <p style="margin: 0 0 6px; font-weight: 600; color: #334155;">Direct Login Link (if button does not open):</p>
                <a href="${directLoginUrl}" target="_blank" style="color: #059669; text-decoration: underline; word-break: break-all; font-family: monospace; font-size: 11px;">
                  ${directLoginUrl}
                </a>
              </div>

              <!-- Feature Highlights / Guidelines -->
              <div style="margin-top: 26px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
                <h4 style="margin: 0 0 10px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.6px; color: #64748b; font-weight: 700;">
                  What you can do in your Faculty Portal:
                </h4>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size: 13px; color: #334155; line-height: 1.6;">
                  <tr>
                    <td style="padding: 4px 0;">👥 <strong>Mentee Management:</strong> Review all assigned undergraduate / postgraduate students and monitor attendance or performance.</td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0;">🗓️ <strong>Counseling Sessions:</strong> Schedule and conduct 1-on-1 or group advisory meetings with integrated digital notes.</td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0;">🎫 <strong>Student Concerns & Tickets:</strong> Review issues filed by your mentees, provide initial guidance, or escalate unresolved matters to Relationship Officers (RO).</td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0;">📑 <strong>Session Reports:</strong> Record session attendance and interaction notes.</td>
                  </tr>
                </table>
              </div>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 32px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #64748b; line-height: 1.5;">
              <p style="margin: 0 0 4px; font-weight: 600; color: #334155;">
                NITTE Mentorship & Academic Support Administration
              </p>
              <p style="margin: 0 0 4px; font-size: 11px; color: #64748b;">
                Nitte (Deemed to be University), Deralakatte, Mangaluru, Karnataka 575018
              </p>
              <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                This is an automated credential notification. Please keep your credentials confidential.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

export const generateMentorOnboardingEmailText = ({
  name = 'Faculty Mentor',
  mentorId = '',
  email = '',
  dept = 'CSE',
  assignedClass = 'CSE 5th Sem - Batch A',
  generatedPassword = '',
  portalBaseUrl = 'http://localhost:5173'
}) => {
  const directLoginUrl = `${portalBaseUrl.replace(/\/$/, '')}/?role=Mentor&id=${encodeURIComponent(mentorId)}&pwd=${encodeURIComponent(generatedPassword)}`;

  return `NITTE (Deemed to be University) - Faculty Mentorship Portal
Official Faculty Account Activation & Credentials

Dear Prof. / Dr. ${name},

Welcome to the NITTE Faculty Mentorship Network! Your official faculty advisor account has been provisioned and verified by Institutional Administration.

Faculty Details:
- Department: ${dept}
- Mentorship Class / Batch: ${assignedClass || 'General Batch'}
- Role: Faculty Mentor (Advisor)
- Capacity: Up to 30 Mentees

Your Login Credentials:
- Faculty / Mentor ID: ${mentorId}
- Registered Email: ${email}
- Password: ${generatedPassword}

👉 Click the direct link below to open the faculty portal (pre-fills your credentials):
${directLoginUrl}

⚡ Note: The link will pre-fill your Faculty ID and password. Simply click "Sign In to Faculty Mentor Portal" to enter your dashboard.

Portal: ${portalBaseUrl}
NITTE Mentorship & Academic Support Desk
Nitte (Deemed to be University), Deralakatte, Mangaluru, Karnataka 575018`;
};
