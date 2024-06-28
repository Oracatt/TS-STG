#pragma once
#include "iunknown.h"

namespace tsstg
{
    DEFINE_CLASS_GUID(IWeakReference, 0xd2c86dec4b8f8ef7ULL, 0xee8f0aebff519a66ULL);
    class IWeakReference : public virtual IUnknown
    {
    public:
        virtual bool Resolve(const GUID& guid, void** ppv) = 0;
    };

    DEFINE_CLASS_GUID(IWeakReferenceSource, 0xf52f291d70a2fc42ULL, 0xc18e4aa73822c8e8ULL);
    class IWeakReferenceSource : public virtual IUnknown
    {
    public:
        virtual bool GetWeakReference(IWeakReference** ppv) = 0;
    };

    template<class T> class WeakPtr
    {
        IWeakReference* mReference;

    public:
        WeakPtr()
        {
            mReference = nullptr;
        }

        WeakPtr(T* ptr) : WeakPtr()
        {
            if (ptr)
            {
                ptr->GetWeakReference(&mReference);
            }
        }

        WeakPtr(const WeakPtr<T>& val) noexcept
        {
            mReference = val.mReference;
            if (mReference)
            {
                mReference->AddRef();
            }
        }

        template<class TP, class = class std::enable_if<std::is_convertible<TP*, T*>::value>::type>
        WeakPtr(const WeakPtr<TP>& val) noexcept : WeakPtr()
        {
            mReference = val.mReference;
            if (mReference)
            {
                mReference->AddRef();
            }
        }

        WeakPtr(const ComPtr<T>& val) noexcept
            : WeakPtr()
        {
            if (val)
            {
                val->GetWeakReference(&mReference);
            }
        }

        template<class TP, class = class std::enable_if<std::is_convertible<TP*, T*>::value>::type>
        WeakPtr(const ComPtr<TP>& val) noexcept : WeakPtr()
        {
            if (val)
            {
                val->GetWeakReference(&mReference);
            }
        }

        WeakPtr(WeakPtr<T>&& val) noexcept
            : WeakPtr()
        {
            mReference = val.mReference;
            val.mReference = nullptr;
        }

        template<class TP, class = class std::enable_if<std::is_convertible<TP*, T*>::value>::type>
        WeakPtr(WeakPtr<TP>&& val) noexcept : WeakPtr()
        {
            mReference = val.mReference;
            val.mReference = nullptr;
        }

        ~WeakPtr()
        {
            if (mReference)
            {
                mReference->Release();
            }
            mReference = nullptr;
        }

        WeakPtr<T>& operator=(const WeakPtr<T>& val)
        {
            T* oldRef = mReference;
            mReference = val.mReference;
            if (mReference)
            {
                mReference->AddRef();
            }
            if (oldRef)
            {
                oldRef->Release();
            }
            return *this;
        }

        template<class TP, class = class std::enable_if<std::is_convertible<TP*, T*>::value>::type>
        WeakPtr<T>& operator=(const WeakPtr<TP>& val)
        {
            T* oldRef = mReference;
            mReference = val.mReference;
            if (mReference)
            {
                mReference->AddRef();
            }
            if (oldRef)
            {
                oldRef->Release();
            }
            return *this;
        }

        WeakPtr<T>&
        operator=(T* val)
        {
            T* oldRef = mReference;
            mReference = nullptr;
            if (val)
            {
                val->GetWeakReference(&mReference);
            }
            if (oldRef)
            {
                oldRef->Release();
            }
            return *this;
        }

        WeakPtr<T>& operator=(const ComPtr<T>& val)
        {
            T* oldRef = mReference;
            mReference = nullptr;
            if (val)
            {
                val->GetWeakReference(&mReference);
            }
            if (oldRef)
            {
                oldRef->Release();
            }
            return *this;
        }

        template<class TP, class = class std::enable_if<std::is_convertible<TP*, T*>::value>::type>
        WeakPtr<T>& operator=(const ComPtr<TP>& val)
        {
            T* oldRef = mReference;
            mReference = nullptr;
            if (val)
            {
                val->GetWeakReference(&mReference);
            }
            if (oldRef)
            {
                oldRef->Release();
            }
            return *this;
        }

        friend bool
        operator!=(const WeakPtr<T>& lhs, const WeakPtr<T>& rhs)
        {
            return !(lhs.Lock() == rhs.Lock());
        }

        friend bool operator!=(T* lhs, const WeakPtr<T>& rhs)
        {
            return !(lhs == rhs.Lock());
        }

        friend bool operator!=(const WeakPtr<T>& lhs, T* rhs)
        {
            return !(lhs.Lock() == rhs);
        }

        friend bool operator==(const WeakPtr<T>& lhs, T* rhs)
        {
            return lhs.Lock() == rhs;
        }

        friend bool operator==(T* lhs, const WeakPtr<T>& rhs)
        {
            return lhs == rhs.Lock();
        }

        friend bool operator==(const WeakPtr<T>& lhs, const WeakPtr<T>& rhs)
        {
            return (lhs.Lock() == rhs.Lock());
        }

        friend bool operator<(const WeakPtr<T>& lhs, const WeakPtr<T>& rhs)
        {
            return (lhs.Lock() < rhs.Lock());
        }

        inline bool IsValid() const
        {
            return mReference != nullptr && Lock().IsValid();
        }

        inline operator bool() const
        {
            return IsValid();
        }

        inline ComPtr<T> Lock() const
        {
            ComPtr<T> ptr;
            if (mReference)
            {
                mReference->Resolve(GUID_OF(T), reinterpret_cast<void**>(&ptr));
            }
            return ptr;
        }

        void Reset()
        {
            if (mReference)
            {
                mReference->Release();
            }
            mReference = nullptr;
        }
    };
} // namespace tsstg