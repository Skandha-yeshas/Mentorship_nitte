/**
 * Generates modern, responsive institutional onboarding HTML and plain-text emails
 * for students uploaded via the Admin Roster Bulk Import.
 * Includes a One-Click Direct Sign-In action button containing the Student ID & Password.
 */

export const generateStudentOnboardingEmailHtml = ({
  name = 'Student',
  studentId = '',
  email = '',
  branch = 'CSE',
  sem = 5,
  generatedPassword = '',
  portalBaseUrl = 'http://localhost:5173'
}) => {
  const directLoginUrl = `${portalBaseUrl.replace(/\/$/, '')}/?role=Student&id=${encodeURIComponent(studentId)}&pwd=${encodeURIComponent(generatedPassword)}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NITTE Student Account Credentials</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 32px 12px;">
    <tr>
      <td align="center">
        <!-- Main Container Card -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0;">
          
          <!-- Modern Gradient Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #091e42 0%, #1e3a8a 52%, #2563eb 100%); padding: 36px 32px 28px; text-align: center; color: #ffffff;">
              <div style="display: inline-block; background: rgba(255, 255, 255, 0.15); border: 1px solid rgba(255, 255, 255, 0.25); border-radius: 30px; padding: 5px 16px; font-size: 11px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: #bfdbfe; margin-bottom: 14px;">
                🏛️ NITTE (DEEMED TO BE UNIVERSITY)
              </div>
              <h1 style="margin: 0; font-size: 23px; font-weight: 800; letter-spacing: -0.3px; color: #ffffff; line-height: 1.3;">
                Student Mentorship Portal
              </h1>
              <p style="margin: 8px 0 0 0; font-size: 13px; color: #93c5fd; font-weight: 400;">
                Official Account Activation & One-Click Login Access
              </p>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px 32px 24px;">
              <p style="margin: 0 0 14px; font-size: 16px; color: #0f172a; line-height: 1.5;">
                Dear <strong style="color: #1e3a8a;">${name}</strong>,
              </p>
              <p style="margin: 0 0 18px; font-size: 14px; color: #475569; line-height: 1.6;">
                Welcome! Your official student account has been created and verified by the College Administration. You are now officially enrolled in the <strong>NITTE Student Mentorship & Grievance Escalation System</strong>.
              </p>

              <!-- Academic Profile Snapshot Tag -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0; margin-bottom: 22px;">
                <tr>
                  <td style="padding: 12px 18px; font-size: 13px; color: #334155;">
                    <span style="display: inline-block; margin-right: 18px;"><strong>📚 Branch:</strong> ${branch}</span>
                    <span style="display: inline-block; margin-right: 18px;"><strong>🎓 Semester:</strong> Sem ${sem}</span>
                    <span style="display: inline-block;"><strong>🛡️ Role:</strong> Student (Mentee)</span>
                  </td>
                </tr>
              </table>

              <!-- Modern Credentials Box -->
              <div style="background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%); border: 1px solid #cbd5e1; border-top: 4px solid #2563eb; border-radius: 12px; padding: 20px; margin-bottom: 26px; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">
                  <h3 style="margin: 0; font-size: 15px; font-weight: 700; color: #1e3a8a;">
                    🔐 Official Login Credentials
                  </h3>
                  <span style="font-size: 11px; background: #ecfdf5; color: #059669; padding: 3px 8px; border-radius: 20px; font-weight: 700; border: 1px solid #a7f3d0;">
                    ✓ Active
                  </span>
                </div>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size: 13px; color: #1e293b; line-height: 1.8;">
                  <tr>
                    <td width="38%" style="color: #64748b; font-weight: 600; padding: 5px 0;">Student USN / ID:</td>
                    <td style="padding: 5px 0;">
                      <code style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 14px; font-weight: 700; background: #eff6ff; color: #1d4ed8; padding: 3px 8px; border-radius: 6px; border: 1px solid #bfdbfe;">
                        ${studentId}
                      </code>
                    </td>
                  </tr>
                  <tr>
                    <td style="color: #64748b; font-weight: 600; padding: 5px 0;">Registered Gmail:</td>
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
                        <td align="center" style="border-radius: 10px; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); box-shadow: 0 4px 16px rgba(37, 99, 235, 0.35);">
                          <a href="${directLoginUrl}" target="_blank" style="display: inline-block; padding: 14px 34px; font-size: 15px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 10px; letter-spacing: 0.2px;">
                            👉 Open Student Login Portal
                          </a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin: 10px 0 0 0; font-size: 12px; color: #64748b; text-align: center;">
                      ⚡ Pre-fills your USN & password on the login page. Simply click "Sign In" to enter.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Fallback Direct URL Box -->
              <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 12px; margin-top: 18px; font-size: 12px; color: #475569;">
                <p style="margin: 0 0 6px; font-weight: 600; color: #334155;">Direct Login Link (if button does not open):</p>
                <a href="${directLoginUrl}" target="_blank" style="color: #2563eb; text-decoration: underline; word-break: break-all; font-family: monospace; font-size: 11px;">
                  ${directLoginUrl}
                </a>
              </div>

              <!-- Feature Highlights / Guidelines -->
              <div style="margin-top: 26px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
                <h4 style="margin: 0 0 10px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.6px; color: #64748b; font-weight: 700;">
                  What you can do in your portal:
                </h4>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size: 13px; color: #334155; line-height: 1.6;">
                  <tr>
                    <td style="padding: 4px 0;">🎯 <strong>Faculty Mentorship:</strong> View assigned faculty mentor contact details & schedule 1-on-1 counseling.</td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0;">🎫 <strong>Raise Issues:</strong> Submit confidential academic, infrastructure, or attendance tickets (up to 2 active per week).</td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0;">🔒 <strong>Privacy:</strong> Your issues are only visible to your assigned mentor and designated college officers.</td>
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

export const generateStudentOnboardingEmailText = ({
  name = 'Student',
  studentId = '',
  email = '',
  branch = 'CSE',
  sem = 5,
  generatedPassword = '',
  portalBaseUrl = 'http://localhost:5173'
}) => {
  const directLoginUrl = `${portalBaseUrl.replace(/\/$/, '')}/?role=Student&id=${encodeURIComponent(studentId)}&pwd=${encodeURIComponent(generatedPassword)}`;

  return `NITTE (Deemed to be University) - Student Mentorship Portal
Official Account Activation & Credentials

Dear ${name},

Welcome! Your official student account has been created by the College Administration.

Academic Details:
- Branch: ${branch}
- Semester: Sem ${sem}
- Role: Student (Mentee)

Your Login Credentials:
- Student USN / ID: ${studentId}
- Registered Gmail: ${email}
- Password: ${generatedPassword}

👉 Click the link below to open login page (pre-fills your credentials):
${directLoginUrl}

Portal: ${portalBaseUrl}
NITTE Mentorship & Academic Support Desk`;
};

/**
 * Generates modern, responsive institutional HTML email when a Relationship Officer (RO)
 * schedules or reschedules a grievance meeting with a student.
 * Contains full ticket metadata, confirmed date/time, mode, venue, directives, and 1-click portal link.
 */
export const generateRoMeetingScheduledEmailHtml = ({
  studentName = 'Student',
  studentId = '',
  studentEmail = '',
  issueId = '',
  category = 'General Grievance',
  priority = 'Medium',
  description = '',
  roName = 'Relationship Officer',
  roId = 'RO',
  roEmail = 'skandhayashu2906@gmail.com',
  roJurisdiction = '',
  date = '',
  time = '',
  mode = 'Offline',
  location = '',
  notes = '',
  feedback = '',
  agenda = '',
  isReschedule = false,
  portalBaseUrl = 'http://localhost:5173'
}) => {
  const directLoginUrl = `${portalBaseUrl.replace(/\/$/, '')}/?role=Student&id=${encodeURIComponent(studentId)}`;
  const isOnline = (mode || '').toLowerCase().includes('online') || (location || '').toLowerCase().includes('video');
  const actionTitle = isReschedule ? 'Meeting Rescheduled Notice' : 'Meeting Scheduled Notice';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${actionTitle} - ${issueId}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 32px 12px;">
    <tr>
      <td align="center">
        <!-- Main Container Card -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 620px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0;">
          
          <!-- Modern Gradient Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #091e42 0%, #1e3a8a 52%, #2563eb 100%); padding: 36px 32px 28px; text-align: center; color: #ffffff;">
              <div style="display: inline-block; background: rgba(255, 255, 255, 0.15); border: 1px solid rgba(255, 255, 255, 0.25); border-radius: 30px; padding: 5px 16px; font-size: 11px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: #bfdbfe; margin-bottom: 14px;">
                🏛️ NITTE (DEEMED TO BE UNIVERSITY)
              </div>
              <h1 style="margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.3px; color: #ffffff; line-height: 1.3;">
                ${isReschedule ? '🔄 Grievance Meeting Rescheduled' : '📅 Grievance Meeting Scheduled'}
              </h1>
              <p style="margin: 8px 0 0 0; font-size: 13px; color: #93c5fd; font-weight: 400;">
                Official Appointment with Relationship Officer &bull; Ticket #${issueId}
              </p>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px 32px 24px;">
              <p style="margin: 0 0 14px; font-size: 16px; color: #0f172a; line-height: 1.5;">
                Dear <strong style="color: #1e3a8a;">${studentName}</strong>,
              </p>
              <p style="margin: 0 0 18px; font-size: 14px; color: #475569; line-height: 1.6;">
                Your assigned Relationship Officer has <strong>${isReschedule ? 'rescheduled' : 'confirmed and scheduled'}</strong> an official resolution meeting regarding your grievance ticket <strong>#${issueId}</strong>.
              </p>

              <!-- Meeting Details Spotlight Box -->
              <div style="background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%); border: 1px solid #cbd5e1; border-top: 4px solid #2563eb; border-radius: 12px; padding: 22px; margin-bottom: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">
                  <h3 style="margin: 0; font-size: 15px; font-weight: 700; color: #1e3a8a;">
                    🗓️ Confirmed Meeting Details
                  </h3>
                  <span style="font-size: 11px; background: #ecfdf5; color: #059669; padding: 3px 10px; border-radius: 20px; font-weight: 700; border: 1px solid #a7f3d0;">
                    ✓ Confirmed on Roster
                  </span>
                </div>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size: 13px; color: #1e293b; line-height: 1.8;">
                  <tr>
                    <td width="36%" style="color: #64748b; font-weight: 600; padding: 5px 0;">📅 Date:</td>
                    <td style="padding: 5px 0;">
                      <strong style="color: #0f172a; font-size: 14px;">${date}</strong>
                    </td>
                  </tr>
                  <tr>
                    <td style="color: #64748b; font-weight: 600; padding: 5px 0;">⏰ Time Slot:</td>
                    <td style="padding: 5px 0;">
                      <strong style="color: #2563eb; font-size: 14px;">${time}</strong>
                    </td>
                  </tr>
                  <tr>
                    <td style="color: #64748b; font-weight: 600; padding: 5px 0;">📍 Meeting Mode:</td>
                    <td style="padding: 5px 0;">
                      <span style="display: inline-block; background: ${isOnline ? '#eff6ff' : '#f0fdf4'}; color: ${isOnline ? '#1d4ed8' : '#15803d'}; font-weight: 700; padding: 2px 10px; border-radius: 6px; border: 1px solid ${isOnline ? '#bfdbfe' : '#bbf7d0'}; font-size: 12px;">
                        ${isOnline ? '💻 Online Video Call Session' : '🏢 In-Person / Offline on Campus'}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td style="color: #64748b; font-weight: 600; padding: 5px 0;">🏢 Venue / Location:</td>
                    <td style="padding: 5px 0;">
                      <strong style="color: #0f172a;">${location || 'RO Office Desk 1 (Admin Block)'}</strong>
                    </td>
                  </tr>
                  <tr>
                    <td style="color: #64748b; font-weight: 600; padding: 5px 0;">👤 Relationship Officer:</td>
                    <td style="padding: 5px 0;">
                      <strong>${roName}</strong> <code style="font-size: 11px; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; color: #475569;">(${roId})</code>
                    </td>
                  </tr>
                  ${roJurisdiction ? `
                  <tr>
                    <td style="color: #64748b; font-weight: 600; padding: 5px 0;">🏛️ Officer Jurisdiction:</td>
                    <td style="padding: 5px 0; color: #475569;">
                      ${roJurisdiction}
                    </td>
                  </tr>` : ''}
                  <tr>
                    <td style="color: #64748b; font-weight: 600; padding: 5px 0; vertical-align: top;">📋 Officer Directives:</td>
                    <td style="padding: 5px 0;">
                      <div style="background: #f8fafc; border-left: 3px solid #3b82f6; padding: 8px 12px; border-radius: 4px; color: #334155; font-size: 13px; line-height: 1.5;">
                        ${notes || 'Please bring your student ID card and any supporting documents relevant to this ticket.'}
                      </div>
                    </td>
                  </tr>
                  ${feedback ? `
                  <tr>
                    <td style="color: #64748b; font-weight: 600; padding: 5px 0; vertical-align: top;">💬 Switch Feedback:</td>
                    <td style="padding: 5px 0;">
                      <div style="background: #fffbeb; border-left: 3px solid #f59e0b; padding: 8px 12px; border-radius: 4px; color: #92400e; font-size: 12px; line-height: 1.4;">
                        ${feedback}
                      </div>
                    </td>
                  </tr>` : ''}
                  ${agenda ? `
                  <tr>
                    <td style="color: #64748b; font-weight: 600; padding: 5px 0; vertical-align: top;">📝 Discussion Agenda:</td>
                    <td style="padding: 5px 0;">
                      <div style="background: #ecfdf5; border-left: 3px solid #10b981; padding: 8px 12px; border-radius: 4px; color: #065f46; font-size: 12px; line-height: 1.4;">
                        ${agenda}
                      </div>
                    </td>
                  </tr>` : ''}
                </table>
              </div>

              <!-- Ticket Snapshot Card -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 14px 18px; font-size: 13px; color: #334155;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                      <span><strong>🎫 Ticket ID:</strong> <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-weight: 700;">#${issueId}</code></span>
                      <span><strong>🏷️ Category:</strong> ${category}</span>
                      <span><strong>⚡ Priority:</strong> <span style="color: #dc2626; font-weight: 700;">${priority}</span></span>
                    </div>
                    ${description ? `
                    <div style="margin-top: 8px; font-size: 12px; color: #64748b; border-top: 1px dashed #cbd5e1; padding-top: 8px;">
                      <strong>Issue Statement:</strong> "${description.length > 140 ? description.substring(0, 140) + '...' : description}"
                    </div>` : ''}
                  </td>
                </tr>
              </table>

              <!-- Direct 1-Click Portal Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 24px 0 16px;">
                <tr>
                  <td align="center">
                    <table role="presentation" cellspacing="0" cellpadding="0">
                      <tr>
                        <td align="center" style="border-radius: 10px; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); box-shadow: 0 4px 16px rgba(37, 99, 235, 0.35);">
                          <a href="${directLoginUrl}" target="_blank" style="display: inline-block; padding: 14px 34px; font-size: 15px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 10px; letter-spacing: 0.2px;">
                            👉 Open Student Portal & View Meeting
                          </a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin: 10px 0 0 0; font-size: 12px; color: #64748b; text-align: center;">
                      ${isOnline ? '💻 In-app video meeting room unlocks automatically when RO starts the session.' : '🏢 Please report 5 minutes prior to the scheduled time at the designated desk.'}
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Instructions / Guidelines -->
              <div style="margin-top: 24px; padding-top: 18px; border-top: 1px solid #e2e8f0;">
                <h4 style="margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.6px; color: #64748b; font-weight: 700;">
                  Important Instructions for Mentee:
                </h4>
                <ul style="margin: 0; padding-left: 18px; font-size: 12px; color: #475569; line-height: 1.6;">
                  <li>Punctuality is mandatory. If you are unable to attend, notify your Relationship Officer via the portal in advance.</li>
                  ${isOnline ? '<li>For Online video calls, ensure you have a stable internet connection and microphone/camera access allowed in your browser.</li>' : '<li>Carry your physical University ID Card and relevant hall tickets or fee receipts.</li>'}
                  <li>Meeting discussions and action items are recorded for official grievance compliance.</li>
                </ul>
              </div>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 32px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #64748b; line-height: 1.5;">
              <p style="margin: 0 0 4px; font-weight: 600; color: #334155;">
                NITTE Student Mentorship & Grievance Redressal Cell
              </p>
              <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                This institutional alert was dispatched on behalf of Relationship Officer ${roName} (${roEmail}).
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

export const generateRoMeetingScheduledEmailText = ({
  studentName = 'Student',
  studentId = '',
  issueId = '',
  category = 'General Grievance',
  priority = 'Medium',
  roName = 'Relationship Officer',
  roId = 'RO',
  date = '',
  time = '',
  mode = 'Offline',
  location = '',
  notes = '',
  feedback = '',
  agenda = '',
  isReschedule = false,
  portalBaseUrl = 'http://localhost:5173'
}) => {
  const directLoginUrl = `${portalBaseUrl.replace(/\/$/, '')}/?role=Student&id=${encodeURIComponent(studentId)}`;

  return `NITTE (Deemed to be University) - Student Mentorship Portal
${isReschedule ? 'MEETING RESCHEDULED NOTICE' : 'OFFICIAL MEETING SCHEDULED NOTICE'}

Dear ${studentName},

Your assigned Relationship Officer has ${isReschedule ? 'rescheduled' : 'confirmed and scheduled'} an official grievance resolution meeting.

Meeting Details:
- Ticket ID: #${issueId}
- Category: ${category} (Priority: ${priority})
- Date: ${date}
- Time Slot: ${time}
- Mode: ${mode}
- Venue / Location: ${location || 'RO Office Desk 1 (Admin Block)'}
- Relationship Officer: ${roName} (${roId})
- Officer Directives: ${notes || 'Bring student ID card and relevant documents.'}
${feedback ? `- Switch Feedback: ${feedback}\n` : ''}${agenda ? `- Agenda / Minutes: ${agenda}\n` : ''}
👉 Access Student Portal & View Meeting:
${directLoginUrl}

NITTE Student Mentorship & Grievance Redressal Cell`;
};
