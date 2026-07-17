"use client";

import React, { useState } from 'react';

interface AdminDomainVerificationProps {
  clientDomain?: string;
  dkimKeyName?: string;
  dkimKeyValue?: string;
}

export default function AdminDomainVerification({
  clientDomain = 'jeevanecotex.com',
  dkimKeyName = 'postal-1a2b3c._domainkey',
  dkimKeyValue = 'v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1...'
}: AdminDomainVerificationProps) {
  const [spfVerified, setSpfVerified] = useState(false);
  const [dkimVerified, setDkimVerified] = useState(false);
  const [returnPathVerified, setReturnPathVerified] = useState(false);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard');
  };

  const allVerified = spfVerified && dkimVerified && returnPathVerified;

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white shadow-lg rounded-xl border border-gray-100 font-sans">
      <div className="mb-8 border-b pb-6">
        <h2 className="text-2xl font-bold text-gray-900">Domain Verification Diagnostic</h2>
        <p className="text-gray-500 mt-2 text-sm">
          Follow the steps below to authenticate <span className="font-semibold text-gray-800">{clientDomain}</span> for outbound relaying on Bloomgard erp.
        </p>
      </div>

      <div className="space-y-6">
        {/* Step 1: SPF */}
        <div className={`p-5 rounded-lg border-l-4 ${spfVerified ? 'border-green-500 bg-green-50' : 'border-blue-500 bg-gray-50'}`}>
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                Step 1: SPF Validation Check
                {spfVerified && <span className="text-green-600 text-sm bg-green-100 px-2 py-0.5 rounded-full">Verified</span>}
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                The client's IT Administrator must add a TXT record at the apex/root of their custom domain to authorize our Postal infrastructure.
              </p>
              
              <div className="mt-4 bg-white p-3 rounded border text-sm">
                <div className="grid grid-cols-4 gap-4 mb-2 text-gray-500 text-xs uppercase font-semibold">
                  <div>Type</div>
                  <div>Name/Host</div>
                  <div className="col-span-2">Value</div>
                </div>
                <div className="grid grid-cols-4 gap-4 items-center">
                  <div className="font-mono">TXT</div>
                  <div className="font-mono">@</div>
                  <div className="col-span-2 flex items-center justify-between font-mono bg-gray-50 p-2 rounded">
                    <span className="truncate">v=spf1 a mx include:spf.mail.bloomgard.co include:_spf.mx.cloudflare.net ~all</span>
                    <button onClick={() => copyToClipboard('v=spf1 a mx include:spf.mail.bloomgard.co include:_spf.mx.cloudflare.net ~all')} className="text-blue-600 hover:text-blue-800 ml-2">Copy</button>
                  </div>
                </div>
              </div>
            </div>
            <button 
              onClick={() => setSpfVerified(!spfVerified)}
              className={`px-4 py-2 text-sm rounded transition-colors ${spfVerified ? 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
            >
              {spfVerified ? 'Revoke' : 'Verify SPF'}
            </button>
          </div>
        </div>

        {/* Step 2: DKIM */}
        <div className={`p-5 rounded-lg border-l-4 ${dkimVerified ? 'border-green-500 bg-green-50' : 'border-blue-500 bg-gray-50'}`}>
          <div className="flex justify-between items-start">
            <div className="w-full pr-6">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                Step 2: DKIM Key Generation & Broadcasting
                {dkimVerified && <span className="text-green-600 text-sm bg-green-100 px-2 py-0.5 rounded-full">Verified</span>}
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Add this TXT record inside the respective DNS registrar to cryptographically sign outbound emails, preventing them from failing or landing in spam.
              </p>
              
              <div className="mt-4 bg-white p-3 rounded border text-sm">
                <div className="grid grid-cols-4 gap-4 mb-2 text-gray-500 text-xs uppercase font-semibold">
                  <div>Type</div>
                  <div>Name/Host</div>
                  <div className="col-span-2">Value</div>
                </div>
                <div className="grid grid-cols-4 gap-4 items-center">
                  <div className="font-mono">TXT</div>
                  <div className="font-mono truncate">{dkimKeyName}</div>
                  <div className="col-span-2 flex items-center justify-between font-mono bg-gray-50 p-2 rounded">
                    <span className="truncate w-48">{dkimKeyValue}</span>
                    <button onClick={() => copyToClipboard(dkimKeyValue)} className="text-blue-600 hover:text-blue-800 ml-2">Copy</button>
                  </div>
                </div>
              </div>
            </div>
            <button 
              onClick={() => setDkimVerified(!dkimVerified)}
              className={`px-4 py-2 text-sm rounded whitespace-nowrap transition-colors ${dkimVerified ? 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
            >
              {dkimVerified ? 'Revoke' : 'Verify DKIM'}
            </button>
          </div>
        </div>

        {/* Step 3: Return Path */}
        <div className={`p-5 rounded-lg border-l-4 ${returnPathVerified ? 'border-green-500 bg-green-50' : 'border-blue-500 bg-gray-50'}`}>
          <div className="flex justify-between items-start">
            <div className="w-full pr-6">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                Step 3: Tracking / Return Path Verification
                {returnPathVerified && <span className="text-green-600 text-sm bg-green-100 px-2 py-0.5 rounded-full">Verified</span>}
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Ensure the tracking CNAME or MX Return Path records match the client's DNS settings exactly so Postal can verify the domain as fully "Green" and authenticated.
              </p>
              
              <div className="mt-4 bg-white p-3 rounded border text-sm">
                <div className="grid grid-cols-4 gap-4 mb-2 text-gray-500 text-xs uppercase font-semibold">
                  <div>Type</div>
                  <div>Name/Host</div>
                  <div className="col-span-2">Value</div>
                </div>
                <div className="grid grid-cols-4 gap-4 items-center">
                  <div className="font-mono">CNAME</div>
                  <div className="font-mono">bounce</div>
                  <div className="col-span-2 flex items-center justify-between font-mono bg-gray-50 p-2 rounded">
                    <span className="truncate">mail.bloomgard.co</span>
                    <button onClick={() => copyToClipboard('mail.bloomgard.co')} className="text-blue-600 hover:text-blue-800 ml-2">Copy</button>
                  </div>
                </div>
              </div>
            </div>
            <button 
              onClick={() => setReturnPathVerified(!returnPathVerified)}
              className={`px-4 py-2 text-sm rounded whitespace-nowrap transition-colors ${returnPathVerified ? 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
            >
              {returnPathVerified ? 'Revoke' : 'Verify Return Path'}
            </button>
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div className={`mt-8 p-4 rounded-lg flex items-center justify-between ${allVerified ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
        <div>
          <h4 className="font-bold text-lg">
            {allVerified ? 'Domain Fully Authenticated' : 'Authentication Pending'}
          </h4>
          <p className={`text-sm ${allVerified ? 'text-green-100' : 'text-gray-500'}`}>
            {allVerified 
              ? 'Outbound relaying is permanently unlocked for this domain.'
              : 'Complete all 3 steps to unlock outbound relaying.'}
          </p>
        </div>
        <div className="text-right text-sm">
          For escalation, contact: <br/>
          <a href="mailto:support@bloomgard.co" className={`font-semibold underline ${allVerified ? 'text-green-50' : 'text-blue-600'}`}>support@bloomgard.co</a>
        </div>
      </div>
    </div>
  );
}
